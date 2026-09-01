from django.conf import settings
from django.db import transaction
from django.db.models import Sum
from phonenumber_field.phonenumber import to_python
from phonenumbers import SUPPORTED_REGIONS
from pretix.base.models import Order, OrderPosition

from pretix_betterpos.models import BetterposTransaction

from .audit_service import AuditService
from .base import ValidationError


class OrderOrchestrationService:
    @staticmethod
    def _normalize_order_locale(locale):
        raw_locale = str(locale or '').strip().lower().replace('_', '-')
        available_locales = dict(settings.LANGUAGES)
        default_locale = 'pt-pt' if 'pt-pt' in available_locales else 'pt' if 'pt' in available_locales else 'en'

        if raw_locale in available_locales:
            return raw_locale

        if raw_locale == 'pt':
            return default_locale

        if raw_locale.startswith('pt-') and 'pt-pt' in available_locales:
            return 'pt-pt'

        if raw_locale.startswith('pt-') and 'pt' in available_locales:
            return 'pt'

        if not raw_locale:
            return default_locale

        return raw_locale if raw_locale in available_locales else default_locale

    @staticmethod
    def _normalize_order_phone(event, phone):
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
    def _resolve_order_email(user):
        user_id = getattr(user, 'pk', None) or 'unknown'
        email = (getattr(user, 'email', '') or '').strip().lower()

        if email and '@' in email:
            local, domain = email.split('@', 1)
            safe_local = ''.join(ch if ch.isalnum() or ch in '._+-' else '-' for ch in local).strip('-')
            safe_domain = ''.join(ch if ch.isalnum() or ch in '.-' else '-' for ch in domain).strip('-')
            safe_local = safe_local or 'user'
            safe_domain = safe_domain or 'betterpos.invalid'
            return f'operator-{user_id}.{safe_local}@{safe_domain}'

        username = (getattr(user, 'username', '') or '').strip().lower()
        safe_username = ''.join(ch if ch.isalnum() or ch in '._-' else '-' for ch in username).strip('-')
        safe_username = safe_username or 'user'
        return f'operator-{user_id}.{safe_username}@betterpos.invalid'

    @staticmethod
    def _resolve_sales_channel(event):
        channel = event.organizer.sales_channels.filter(identifier='betterpos').first()
        if channel:
            return channel

        channel = event.organizer.sales_channels.filter(identifier='web').first()
        if channel:
            return channel

        channel = event.organizer.sales_channels.first()
        if channel:
            return channel

        # Last-resort bootstrap for organizers without any configured sales channel.
        return event.organizer.sales_channels.create(
            label='BetterPOS',
            identifier='betterpos',
            type='api',
            position=0,
            configuration={},
        )

    @staticmethod
    @transaction.atomic
    def create_order_from_cart(*, event, user, register, session, cart_totals, locale='pt-pt', phone=None):
        if not session or session.status != session.STATUS_OPEN:
            raise ValidationError('An open cash session is required before selling')

        # Reconcile stale async states (e.g. order manually marked paid in Pretix backend).
        stale_pending = BetterposTransaction.objects.filter(
            event=event,
            register=register,
            session=session,
            state=BetterposTransaction.STATE_PENDING,
        ).select_related('order')

        for tx in stale_pending:
            if tx.order.status == Order.STATUS_PAID:
                tx.state = BetterposTransaction.STATE_PAID
                tx.save(update_fields=['state', 'updated_at'])
            elif tx.order.status in (Order.STATUS_EXPIRED, Order.STATUS_CANCELED):
                tx.state = BetterposTransaction.STATE_EXPIRED
                tx.save(update_fields=['state', 'updated_at'])

        pending_payments = BetterposTransaction.objects.filter(
            event=event,
            register=register,
            session=session,
            state=BetterposTransaction.STATE_PENDING,
            order__status=Order.STATUS_PENDING,
        ).select_related('order').order_by('-created_at')
        if pending_payments.exists():
            refs = []
            for tx in pending_payments[:10]:
                code = getattr(tx.order, 'code', None)
                if code:
                    refs.append(f'order_id={tx.order_id} (code={code})')
                else:
                    refs.append(f'order_id={tx.order_id}')

            details = ', '.join(refs)
            raise ValidationError(
                f'Existem pagamentos EuPago pendentes: {details}. Aguarde confirmacao antes de prosseguir.'
            )

        sales_channel = OrderOrchestrationService._resolve_sales_channel(event)
        order_phone = OrderOrchestrationService._normalize_order_phone(event, phone)

        order = Order.objects.create(
            event=event,
            status=Order.STATUS_PENDING,
            locale=OrderOrchestrationService._normalize_order_locale(locale),
            email=OrderOrchestrationService._resolve_order_email(user),
            phone=order_phone,
            total=cart_totals.get('total', '0.00'),
            sales_channel=sales_channel,
        )

        created_positions = []
        for idx, line in enumerate(cart_totals['lines'], start=1):
            pos = OrderPosition.objects.create(
                order=order,
                item_id=line['item_id'],
                variation_id=line['variation_id'],
                price=line['unit_price'],
                positionid=idx,
            )
            created_positions.append(pos)

        order.total = (order.positions.aggregate(sum=Sum('price'))['sum'] or 0) + (
            order.fees.aggregate(sum=Sum('value'))['sum'] or 0
        )
        order.save(update_fields=['total'])
        order.create_transactions(is_new=True, positions=created_positions, fees=[])

        transaction_row = BetterposTransaction.objects.create(
            event=event,
            register=register,
            session=session,
            order=order,
            operator=user,
            channel=BetterposTransaction.CHANNEL_CASH,
            state=BetterposTransaction.STATE_ORDER_CREATED,
            metadata={
                'subtotal': cart_totals['subtotal'],
                'discount': cart_totals['discount'],
            },
        )

        AuditService.log(
            event=event,
            actor=user,
            action_type='payment_state_change',
            register=register,
            session=session,
            order=order,
            payload={'state': BetterposTransaction.STATE_ORDER_CREATED},
        )

        return order, transaction_row
