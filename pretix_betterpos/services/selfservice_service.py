import json
import types
from datetime import timedelta

from django.db import transaction
from django.db.utils import OperationalError
from django.db.models import Sum
from django.http import QueryDict
from django.utils import timezone
from phonenumber_field.phonenumber import to_python
from phonenumbers import SUPPORTED_REGIONS
from pretix.base.models import Item, Order, OrderPayment, OrderPosition
from pretix.base.payment import PaymentException

from pretix_betterpos.models import BetterposSelfserviceCheckout

from .base import ValidationError
from .order_service import OrderOrchestrationService
from .payment_service import PaymentService


class SelfserviceCheckoutService:
    @staticmethod
    def _normalize_phone(event, phone):
        raw_phone = str(phone or '').strip()
        if not raw_phone:
            raise ValidationError('Phone number is required')

        if event.settings.region in SUPPORTED_REGIONS:
            region = event.settings.region
        elif event.settings.locale[:2].upper() in SUPPORTED_REGIONS:
            region = event.settings.locale[:2].upper()
        else:
            region = None

        phone_number = to_python(raw_phone, region)
        if not phone_number or not phone_number.is_valid():
            raise ValidationError('Enter a valid phone number')

        return phone_number

    @staticmethod
    def _build_guest_email(phone_value):
        suffix = ''.join(ch for ch in str(phone_value) if ch.isdigit())[-8:] or 'guest'
        return f'selfservice-{suffix}@betterpos.invalid'

    @staticmethod
    @transaction.atomic
    def start_checkout(*, request, event, cart_totals, phone, locale='pt-pt', provider='eupago_mbway'):
        if not cart_totals.get('lines'):
            raise ValidationError('Cart is empty')
        normalized_phone = SelfserviceCheckoutService._normalize_phone(event, phone)

        sales_channel = OrderOrchestrationService._resolve_sales_channel(event)

        order = Order.objects.create(
            event=event,
            status=Order.STATUS_PENDING,
            locale=OrderOrchestrationService._normalize_order_locale(locale),
            email=SelfserviceCheckoutService._build_guest_email(normalized_phone),
            phone=normalized_phone,
            total=cart_totals.get('total', '0.00'),
            sales_channel=sales_channel,
        )

        created_positions = []
        for idx, line in enumerate(cart_totals['lines'], start=1):
            item = Item.objects.get(event=event, pk=line['item_id'])
            pos = OrderPosition.objects.create(
                order=order,
                item=item,
                variation_id=line.get('variation_id'),
                price=line['unit_price'],
                positionid=idx,
            )
            created_positions.append(pos)

        order.total = (order.positions.aggregate(sum=Sum('price'))['sum'] or 0) + (
            order.fees.aggregate(sum=Sum('value'))['sum'] or 0
        )
        order.save(update_fields=['total'])
        order.create_transactions(is_new=True, positions=created_positions, fees=[])

        checkout = BetterposSelfserviceCheckout.objects.create(
            event=event,
            order=order,
            phone=str(normalized_phone),
            token=BetterposSelfserviceCheckout.make_token(),
            expires_at=timezone.now() + timedelta(minutes=5),
            state=BetterposSelfserviceCheckout.STATE_CREATED,
            metadata={
                'source': 'public_buy',
                'cart_lines': cart_totals['lines'],
            },
        )

        payment, provider_response = SelfserviceCheckoutService._initiate_eupago(
            request=request,
            checkout=checkout,
            provider=provider,
        )

        checkout.payment = payment
        checkout.state = BetterposSelfserviceCheckout.STATE_PENDING
        checkout.metadata = {
            **checkout.metadata,
            'provider': provider,
            'provider_response': str(provider_response),
        }
        checkout.save(update_fields=['payment', 'state', 'metadata', 'updated_at'])
        return checkout

    @staticmethod
    def _initiate_eupago(*, request, checkout, provider='eupago_mbway'):
        normalized_phone = ''.join(ch for ch in str(checkout.phone or '') if ch.isdigit() or ch == '+')
        if not normalized_phone:
            raise ValidationError('Phone number is required for MBWay payments')

        request.session[f'payment_{provider}_phone'] = normalized_phone
        request.session['payment_eupago_mbway_phone'] = normalized_phone
        request.session['phone'] = normalized_phone

        qd = QueryDict('', mutable=True)
        qd.update({'phone': normalized_phone})
        request._post = qd

        payment = OrderPayment.objects.create(
            order=checkout.order,
            provider=provider,
            amount=checkout.order.total,
            state=OrderPayment.PAYMENT_STATE_CREATED,
        )

        provider_instance = payment.payment_provider
        if not provider_instance:
            raise ValidationError(f'Payment provider "{provider}" is not available or not configured')

        fallback_redirect_url = request.build_absolute_uri(request.path)
        last_provider_response = None

        if not hasattr(provider_instance, 'order_confirm_redirect_url'):
            provider_instance.order_confirm_redirect_url = fallback_redirect_url

        if provider == 'eupago_mbway' and hasattr(provider_instance, '_handle_payment_response'):
            original_handle = provider_instance._handle_payment_response

            def _safe_handle_payment_response(self, payment_obj, response_obj):
                try:
                    return original_handle(payment_obj, response_obj)
                except AttributeError as exc:
                    if 'order_confirm_redirect_url' not in str(exc):
                        raise
                    payment_obj.info = json.dumps(response_obj)
                    payment_obj.state = OrderPayment.PAYMENT_STATE_PENDING
                    payment_obj.save(update_fields=['info', 'state'])
                    return fallback_redirect_url

            provider_instance._handle_payment_response = types.MethodType(_safe_handle_payment_response, provider_instance)

        if provider.startswith('eupago_') and hasattr(provider_instance, '_make_api_request'):
            original_make_api_request = provider_instance._make_api_request

            def _capturing_make_api_request(*args, **kwargs):
                nonlocal last_provider_response
                response_obj = original_make_api_request(*args, **kwargs)
                if isinstance(response_obj, dict):
                    last_provider_response = response_obj
                elif isinstance(response_obj, str):
                    try:
                        parsed = json.loads(response_obj)
                    except Exception:
                        parsed = None
                    if isinstance(parsed, dict):
                        last_provider_response = parsed
                return response_obj

            provider_instance._make_api_request = _capturing_make_api_request

        try:
            response = provider_instance.execute_payment(request, payment)
        except PaymentException as exc:
            details = None
            if last_provider_response:
                details = PaymentService._extract_provider_error_details(last_provider_response)
                details = PaymentService._description_only_error_text(details)

            exc_message = PaymentService._description_only_error_text(str(exc).strip())
            if details and exc_message and exc_message not in details:
                details = f'{details} | {exc_message}'
            elif not details:
                details = exc_message

            raise ValidationError(f'MBWay payment failed: {details or "Unknown provider error"}') from exc

        return payment, response

    @staticmethod
    @transaction.atomic
    def get_checkout_status(*, checkout):
        checkout.refresh_from_db(fields=['state', 'expires_at', 'payment', 'order', 'metadata', 'updated_at'])

        resolved_state = checkout.state

        if checkout.order.status == Order.STATUS_PAID:
            resolved_state = BetterposSelfserviceCheckout.STATE_PAID
        elif checkout.payment_id:
            payment = checkout.payment
            if payment.state == OrderPayment.PAYMENT_STATE_CONFIRMED:
                resolved_state = BetterposSelfserviceCheckout.STATE_PAID
            elif payment.state in (OrderPayment.PAYMENT_STATE_FAILED, OrderPayment.PAYMENT_STATE_CANCELED):
                resolved_state = BetterposSelfserviceCheckout.STATE_FAILED

        if resolved_state == BetterposSelfserviceCheckout.STATE_FAILED and checkout.order.status == Order.STATUS_PENDING:
            checkout.order.status = Order.STATUS_CANCELED
            try:
                checkout.order.save(update_fields=['status'])
            except OperationalError:
                pass

        if checkout.is_expired() and resolved_state == BetterposSelfserviceCheckout.STATE_PENDING:
            if checkout.order.status == Order.STATUS_PENDING:
                checkout.order.status = Order.STATUS_CANCELED
                try:
                    checkout.order.save(update_fields=['status'])
                except OperationalError:
                    pass
            resolved_state = BetterposSelfserviceCheckout.STATE_TIMEOUT

        if resolved_state != checkout.state:
            checkout.state = resolved_state
            try:
                checkout.save(update_fields=['state', 'updated_at'])
            except OperationalError:
                pass

        return checkout
