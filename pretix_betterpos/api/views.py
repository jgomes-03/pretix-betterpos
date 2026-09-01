import json
import csv
from decimal import Decimal
from datetime import date, timedelta

from django.http import HttpResponse, HttpResponseBadRequest, JsonResponse
from django.db.models import Sum
from django.views import View
from django.utils import timezone
from pretix.base.models import Item, OrderPayment

from pretix_betterpos.auth import get_event_from_request, has_pos_permission
from pretix_betterpos.models import BetterposActionLog, BetterposCashSession, BetterposRegister, BetterposTransaction
from pretix_betterpos.services import (
    CancellationService,
    CartService,
    InvalidStateError,
    BetterPOSError,
    OrderOrchestrationService,
    PaymentService,
    RefundService,
    RegisterService,
    AsyncSettlementService,
    ValidationError,
)

from .serializers import serialize_transaction


class BasePOSApiView(View):
    permission_code = 'can_view_pos'

    def dispatch(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return JsonResponse({'error': 'Authentication required'}, status=401)

        self.event = get_event_from_request(request, kwargs)
        if not has_pos_permission(request.user, self.event, self.permission_code):
            return JsonResponse({'error': f'Missing permission: {self.permission_code}'}, status=403)
        return super().dispatch(request, *args, **kwargs)

    @staticmethod
    def parse_json(request):
        try:
            return json.loads(request.body.decode('utf-8') or '{}')
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValidationError('Invalid JSON payload')

    @staticmethod
    def as_decimal(value, field):
        try:
            return Decimal(str(value))
        except Exception as exc:
            raise ValidationError(f'Invalid decimal value for {field}') from exc

    def get_register(self, register_id):
        try:
            return BetterposRegister.objects.get(event=self.event, pk=register_id, is_active=True)
        except BetterposRegister.DoesNotExist as exc:
            raise ValidationError('Invalid register_id') from exc

    def get_open_session(self, register):
        session = RegisterService.get_open_session(register)
        if not session:
            raise InvalidStateError('An open session is required for this register')
        return session

    @staticmethod
    def error_response(exc):
        status = 400
        if isinstance(exc, InvalidStateError):
            status = 409
        return JsonResponse({'error': str(exc)}, status=status)


class SessionStatusView(BasePOSApiView):
    def get(self, request, *args, **kwargs):
        register_id = request.GET.get('register_id')
        if not register_id:
            return HttpResponseBadRequest('register_id is required')

        register = self.get_register(register_id)
        session = RegisterService.get_open_session(register)
        if not session:
            return JsonResponse({'has_open_session': False, 'register_id': register.id})

        return JsonResponse(
            {
                'has_open_session': True,
                'session': {
                    'id': session.id,
                    'opened_at': session.opened_at.isoformat(),
                    'opened_by': session.opened_by_id,
                    'opening_float': str(session.opening_float),
                    'expected_cash': str(session.expected_cash),
                },
            }
        )


class OpenSessionView(BasePOSApiView):
    permission_code = 'can_session_control_pos'

    def post(self, request, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            register = self.get_register(payload.get('register_id'))
            opening_float = self.as_decimal(payload.get('opening_float', '0.00'), 'opening_float')
            session = RegisterService.open_session(
                event=self.event,
                register=register,
                opened_by=request.user,
                opening_float=opening_float,
            )
            return JsonResponse(
                {
                    'session_id': session.id,
                    'status': session.status,
                    'opening_float': str(session.opening_float),
                    'expected_cash': str(session.expected_cash),
                },
                status=201,
            )
        except BetterPOSError as exc:
            return self.error_response(exc)


class CloseSessionView(BasePOSApiView):
    permission_code = 'can_session_control_pos'

    def post(self, request, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            session = BetterposCashSession.objects.get(
                event=self.event,
                register_id=payload.get('register_id'),
                status=BetterposCashSession.STATUS_OPEN,
            )
            counted_cash = self.as_decimal(payload.get('counted_cash'), 'counted_cash')
            closed = RegisterService.close_session(
                session=session,
                closed_by=request.user,
                counted_cash=counted_cash,
                close_notes=payload.get('close_notes', ''),
            )
            return JsonResponse(
                {
                    'session_id': closed.id,
                    'status': closed.status,
                    'expected_cash': str(closed.expected_cash),
                    'counted_cash': str(closed.counted_cash),
                    'difference': str(closed.difference),
                }
            )
        except BetterposCashSession.DoesNotExist:
            return JsonResponse({'error': 'Open session not found'}, status=404)
        except BetterPOSError as exc:
            return self.error_response(exc)


class SessionReconcileView(BasePOSApiView):
    permission_code = 'can_reconcile_pos'

    def post(self, request, session_id, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            session = BetterposCashSession.objects.get(
                event=self.event,
                pk=session_id,
                status=BetterposCashSession.STATUS_OPEN,
            )
            counted_cash = self.as_decimal(payload.get('counted_cash'), 'counted_cash')
            closed = RegisterService.close_session(
                session=session,
                closed_by=request.user,
                counted_cash=counted_cash,
                close_notes=payload.get('close_notes', ''),
            )
            return JsonResponse(
                {
                    'session_id': closed.id,
                    'status': closed.status,
                    'expected_cash': str(closed.expected_cash),
                    'counted_cash': str(closed.counted_cash),
                    'difference': str(closed.difference),
                }
            )
        except BetterposCashSession.DoesNotExist:
            return JsonResponse({'error': 'Open session not found'}, status=404)
        except BetterPOSError as exc:
            return self.error_response(exc)


class CashMovementView(BasePOSApiView):
    permission_code = 'can_cash_move_pos'

    def post(self, request, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            register = self.get_register(payload.get('register_id'))
            session = self.get_open_session(register)
            movement = RegisterService.create_cash_movement(
                event=self.event,
                session=session,
                performed_by=request.user,
                movement_type=payload.get('movement_type'),
                amount=self.as_decimal(payload.get('amount'), 'amount'),
                reason=payload.get('reason', ''),
                reference=payload.get('reference', ''),
            )
            return JsonResponse(
                {
                    'movement_id': movement.id,
                    'session_id': session.id,
                    'movement_type': movement.movement_type,
                    'amount': str(movement.amount),
                    'expected_cash': str(session.expected_cash),
                },
                status=201,
            )
        except BetterPOSError as exc:
            return self.error_response(exc)


class CatalogView(BasePOSApiView):
    def get(self, request, *args, **kwargs):
        items = (
            Item.objects.filter(event=self.event, admission=True, active=True)
            .prefetch_related('variations')
            .order_by('name')
        )
        data = []
        for item in items:
            data.append(
                {
                    'id': item.id,
                    'name': str(item.name),
                    'price': str(item.default_price),
                    'variations': [
                        {
                            'id': v.id,
                            'value': str(v.value),
                            'price': str(v.price if v.price is not None else item.default_price),
                        }
                        for v in item.variations.all()
                    ],
                }
            )
        return JsonResponse({'items': data})


class QuoteView(BasePOSApiView):
    permission_code = 'can_sell_pos'

    def post(self, request, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            result = CartService.compute_cart_totals(
                event=self.event,
                lines=payload.get('lines', []),
                discount=payload.get('discount'),
            )
            return JsonResponse(result)
        except BetterPOSError as exc:
            return self.error_response(exc)


class CreateOrderView(BasePOSApiView):
    permission_code = 'can_sell_pos'

    def post(self, request, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            register = self.get_register(payload.get('register_id'))
            session = self.get_open_session(register)

            idempotency_key = request.headers.get('Idempotency-Key') or payload.get('idempotency_key', '')
            if idempotency_key:
                existing = BetterposTransaction.objects.filter(
                    event=self.event,
                    register=register,
                    idempotency_key=idempotency_key,
                ).first()
                if existing:
                    return JsonResponse({'transaction': serialize_transaction(existing), 'idempotent_replay': True})

            cart_totals = CartService.compute_cart_totals(
                event=self.event,
                lines=payload.get('lines', []),
                discount=payload.get('discount'),
            )
            order, transaction_row = OrderOrchestrationService.create_order_from_cart(
                event=self.event,
                user=request.user,
                register=register,
                session=session,
                cart_totals=cart_totals,
                locale=payload.get('locale', 'pt-pt'),
                phone=payload.get('phone'),
            )
            if idempotency_key:
                transaction_row.idempotency_key = idempotency_key
                transaction_row.save(update_fields=['idempotency_key'])

            return JsonResponse(
                {
                    'order_code': order.code,
                    'transaction': serialize_transaction(transaction_row),
                },
                status=201,
            )
        except BetterPOSError as exc:
            return self.error_response(exc)


class CashPaymentView(BasePOSApiView):
    permission_code = 'can_sell_pos'

    def post(self, request, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            transaction_row = BetterposTransaction.objects.select_related('order', 'session').get(
                event=self.event,
                pk=payload.get('transaction_id'),
            )
            payment = PaymentService.pay_cash(
                transaction_row=transaction_row,
                user=request.user,
                phone=payload.get('phone'),
            )
            return JsonResponse(
                {
                    'payment_id': payment.id,
                    'transaction': serialize_transaction(transaction_row),
                }
            )
        except BetterposTransaction.DoesNotExist:
            return JsonResponse({'error': 'Transaction not found'}, status=404)
        except BetterPOSError as exc:
            return self.error_response(exc)


class EuPagoPaymentView(BasePOSApiView):
    permission_code = 'can_sell_pos'

    def post(self, request, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            transaction_row = BetterposTransaction.objects.select_related('order', 'session').get(
                event=self.event,
                pk=payload.get('transaction_id'),
            )
            payment, provider_response = PaymentService.initiate_eupago(
                request=request,
                transaction_row=transaction_row,
                user=request.user,
                provider=payload.get('provider', 'eupago_mbway'),
                phone=payload.get('phone'),
            )
            return JsonResponse(
                {
                    'payment_id': payment.id,
                    'transaction': serialize_transaction(transaction_row),
                    'provider_response': str(provider_response),
                }
            )
        except BetterposTransaction.DoesNotExist:
            return JsonResponse({'error': 'Transaction not found'}, status=404)
        except BetterPOSError as exc:
            return self.error_response(exc)


class TransactionStatusView(BasePOSApiView):
    PENDING_AUTO_CANCEL_AFTER = timedelta(minutes=5)

    def _is_pending_timeout_reached(self, transaction_row):
        if not transaction_row.created_at:
            return False
        return transaction_row.created_at <= timezone.now() - self.PENDING_AUTO_CANCEL_AFTER

    def _cancel_unpaid_timeout(self, transaction_row, request, *, source, reason):
        transaction_row = CancellationService.cancel_unpaid_order(
            transaction_row=transaction_row,
            user=request.user,
            reason=reason,
        )
        transaction_row.metadata = {
            **transaction_row.metadata,
            'source': source,
            'timeout_minutes': int(self.PENDING_AUTO_CANCEL_AFTER.total_seconds() // 60),
        }
        transaction_row.save(update_fields=['metadata', 'updated_at'])
        return transaction_row

    def get(self, request, transaction_id, *args, **kwargs):
        try:
            transaction_row = BetterposTransaction.objects.select_related('payment', 'order').get(event=self.event, pk=transaction_id)

            # Reconcile async EuPago payments on polling requests.
            if transaction_row.state == BetterposTransaction.STATE_PENDING:
                if transaction_row.order.status == transaction_row.order.STATUS_PAID:
                    transaction_row = AsyncSettlementService.finalize_pending_payment(
                        payment=transaction_row.payment,
                        actor=request.user,
                        external_state='paid',
                        metadata={'source': 'status_poll_order_state'},
                    ) or transaction_row
                elif transaction_row.order.status in (transaction_row.order.STATUS_EXPIRED, transaction_row.order.STATUS_CANCELED):
                    transaction_row = AsyncSettlementService.finalize_pending_payment(
                        payment=transaction_row.payment,
                        actor=request.user,
                        external_state='expired',
                        metadata={'source': 'status_poll_order_state'},
                    ) or transaction_row

            if transaction_row.state == BetterposTransaction.STATE_PENDING and transaction_row.payment_id:
                payment = transaction_row.payment
                if payment.state == OrderPayment.PAYMENT_STATE_CONFIRMED:
                    transaction_row = AsyncSettlementService.finalize_pending_payment(
                        payment=payment,
                        actor=request.user,
                        external_state='paid',
                        metadata={'source': 'status_poll_payment_state'},
                    ) or transaction_row
                elif payment.state == OrderPayment.PAYMENT_STATE_CANCELED and self._is_pending_timeout_reached(transaction_row):
                    transaction_row = self._cancel_unpaid_timeout(
                        transaction_row,
                        request,
                        source='status_poll_payment_state_timeout',
                        reason='Payment canceled or rejected and timeout reached without successful confirmation.',
                    )
                elif payment.state in (OrderPayment.PAYMENT_STATE_FAILED, OrderPayment.PAYMENT_STATE_CANCELED):
                    transaction_row = AsyncSettlementService.finalize_pending_payment(
                        payment=payment,
                        actor=request.user,
                        external_state='failed',
                        metadata={'source': 'status_poll_payment_state'},
                    ) or transaction_row
                else:
                    provider_instance = payment.payment_provider
                    if hasattr(provider_instance, 'check_payment_status'):
                        try:
                            status_info = provider_instance.check_payment_status(payment) or {}
                            if status_info.get('confirmed'):
                                transaction_row = AsyncSettlementService.finalize_pending_payment(
                                    payment=payment,
                                    actor=request.user,
                                    external_state='paid',
                                    metadata={'source': 'status_poll_provider', 'status_info': status_info},
                                ) or transaction_row
                            elif status_info.get('failed'):
                                transaction_row = AsyncSettlementService.finalize_pending_payment(
                                    payment=payment,
                                    actor=request.user,
                                    external_state='failed',
                                    metadata={'source': 'status_poll_provider', 'status_info': status_info},
                                ) or transaction_row
                        except Exception:
                            # Keep polling flow resilient even if provider status endpoint is unavailable.
                            pass

            # Fallback reconciliation when webhook/provider checks fail:
            # infer final state from Pretix order-level payment confirmation.
            if transaction_row.state == BetterposTransaction.STATE_PENDING:
                # Refresh from DB to avoid stale related-object state during rapid polling.
                transaction_row.refresh_from_db(fields=['state', 'payment', 'metadata', 'updated_at'])
                transaction_row.order.refresh_from_db(fields=['status'])

                # Manual paid confirmation in Pretix should immediately unblock POS,
                # even when provider API checks are unavailable.
                if transaction_row.order.status == transaction_row.order.STATUS_PAID:
                    if transaction_row.payment_id:
                        transaction_row = AsyncSettlementService.finalize_pending_payment(
                            payment=transaction_row.payment,
                            actor=request.user,
                            external_state='paid',
                            metadata={'source': 'status_poll_order_paid_direct'},
                        ) or transaction_row
                    else:
                        transaction_row.state = BetterposTransaction.STATE_PAID
                        transaction_row.metadata = {
                            **transaction_row.metadata,
                            'source': 'status_poll_order_paid_no_payment',
                        }
                        transaction_row.save(update_fields=['state', 'metadata', 'updated_at'])

                confirmed_payment = transaction_row.order.payments.filter(
                    state=OrderPayment.PAYMENT_STATE_CONFIRMED
                ).order_by('-pk').first()

                if confirmed_payment:
                    if transaction_row.payment_id != confirmed_payment.pk:
                        transaction_row.payment = confirmed_payment
                        transaction_row.save(update_fields=['payment', 'updated_at'])
                    transaction_row = AsyncSettlementService.finalize_pending_payment(
                        payment=confirmed_payment,
                        actor=request.user,
                        external_state='paid',
                        metadata={'source': 'status_poll_order_payments'},
                    ) or transaction_row
                elif transaction_row.order.status in (transaction_row.order.STATUS_EXPIRED, transaction_row.order.STATUS_CANCELED):
                    if transaction_row.payment_id:
                        transaction_row = AsyncSettlementService.finalize_pending_payment(
                            payment=transaction_row.payment,
                            actor=request.user,
                            external_state='failed',
                            metadata={'source': 'status_poll_order_fallback'},
                        ) or transaction_row
                    else:
                        transaction_row.state = BetterposTransaction.STATE_FAILED
                        transaction_row.metadata = {
                            **transaction_row.metadata,
                            'source': 'status_poll_order_fallback',
                            'note': 'No payment object linked while order expired/canceled',
                        }
                        transaction_row.save(update_fields=['state', 'metadata', 'updated_at'])

                if (
                    transaction_row.state == BetterposTransaction.STATE_PENDING
                    and transaction_row.order.status == transaction_row.order.STATUS_PENDING
                    and self._is_pending_timeout_reached(transaction_row)
                ):
                    transaction_row = self._cancel_unpaid_timeout(
                        transaction_row,
                        request,
                        source='status_poll_pending_timeout',
                        reason='No payment confirmation received within 5 minutes.',
                    )

            transaction_row.refresh_from_db()
            return JsonResponse({'transaction': serialize_transaction(transaction_row)})
        except BetterposTransaction.DoesNotExist:
            return JsonResponse({'error': 'Transaction not found'}, status=404)


class CancelOrderView(BasePOSApiView):
    permission_code = 'can_cancel_unpaid_pos'

    def post(self, request, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            transaction_row = BetterposTransaction.objects.select_related('order').get(
                event=self.event,
                pk=payload.get('transaction_id'),
            )
            transaction_row = CancellationService.cancel_unpaid_order(
                transaction_row=transaction_row,
                user=request.user,
                reason=payload.get('reason', ''),
            )
            return JsonResponse({'transaction': serialize_transaction(transaction_row)})
        except BetterposTransaction.DoesNotExist:
            return JsonResponse({'error': 'Transaction not found'}, status=404)
        except BetterPOSError as exc:
            return self.error_response(exc)


class RefundOrderView(BasePOSApiView):
    permission_code = 'can_refund_pos'

    def post(self, request, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            transaction_row = BetterposTransaction.objects.select_related('payment').get(
                event=self.event,
                pk=payload.get('transaction_id'),
            )
            refund_payment, transaction_row = RefundService.refund_paid_order(
                transaction_row=transaction_row,
                user=request.user,
                amount=payload.get('amount'),
                reason=payload.get('reason', ''),
            )
            return JsonResponse(
                {
                    'refund_payment_id': refund_payment.id,
                    'transaction': serialize_transaction(transaction_row),
                }
            )
        except BetterposTransaction.DoesNotExist:
            return JsonResponse({'error': 'Transaction not found'}, status=404)
        except BetterPOSError as exc:
            return self.error_response(exc)


class RegistersListView(BasePOSApiView):
    def get(self, request, *args, **kwargs):
        registers = BetterposRegister.objects.filter(event=self.event, is_active=True).order_by('name')
        if not has_pos_permission(request.user, self.event, 'can_session_control_pos'):
            registers = registers.filter(cash_sessions__status=BetterposCashSession.STATUS_OPEN).distinct()
        return JsonResponse({
            'registers': [
                {
                    'id': reg.id,
                    'name': reg.name,
                    'code': reg.code,
                    'currency': reg.default_currency,
                }
                for reg in registers
            ]
        })

    def post(self, request, *args, **kwargs):
        permission_code = 'can_session_control_pos'
        if not has_pos_permission(request.user, self.event, permission_code):
            return JsonResponse({'error': f'Missing permission: {permission_code}'}, status=403)
        
        try:
            payload = self.parse_json(request)
            name = payload.get('name', '').strip()
            code = payload.get('code', '').strip()
            
            if not name or not code:
                return JsonResponse({'error': 'Name and code are required'}, status=400)
            
            # Check if code already exists
            if BetterposRegister.objects.filter(event=self.event, code=code).exists():
                return JsonResponse({'error': 'Register with this code already exists'}, status=400)
            
            register = BetterposRegister.objects.create(
                event=self.event,
                name=name,
                code=code,
                is_active=True,
                default_currency=payload.get('currency', 'EUR')
            )
            
            return JsonResponse({
                'id': register.id,
                'name': register.name,
                'code': register.code,
                'currency': register.default_currency,
            }, status=201)
        except BetterPOSError as exc:
            return self.error_response(exc)


class RegisterDetailView(BasePOSApiView):
    permission_code = 'can_manage_registers_pos'

    def put(self, request, register_id, *args, **kwargs):
        try:
            register = BetterposRegister.objects.get(event=self.event, pk=register_id)
            payload = self.parse_json(request)

            name = payload.get('name', register.name)
            code = payload.get('code', register.code)
            currency = payload.get('currency', register.default_currency)
            is_active = payload.get('is_active', register.is_active)

            if not str(name).strip() or not str(code).strip():
                return JsonResponse({'error': 'Name and code are required'}, status=400)

            if BetterposRegister.objects.filter(event=self.event, code=code).exclude(pk=register.pk).exists():
                return JsonResponse({'error': 'Register with this code already exists'}, status=400)

            register.name = str(name).strip()
            register.code = str(code).strip()
            register.default_currency = str(currency).strip().upper()[:3] or 'EUR'
            register.is_active = bool(is_active)
            register.save()

            return JsonResponse(
                {
                    'id': register.id,
                    'name': register.name,
                    'code': register.code,
                    'currency': register.default_currency,
                    'is_active': register.is_active,
                }
            )
        except BetterposRegister.DoesNotExist:
            return JsonResponse({'error': 'Register not found'}, status=404)
        except BetterPOSError as exc:
            return self.error_response(exc)

    def delete(self, request, register_id, *args, **kwargs):
        try:
            register = BetterposRegister.objects.get(event=self.event, pk=register_id)
            register.is_active = False
            register.save(update_fields=['is_active'])
            return JsonResponse({'ok': True, 'id': register.id, 'is_active': register.is_active})
        except BetterposRegister.DoesNotExist:
            return JsonResponse({'error': 'Register not found'}, status=404)


class SessionsListView(BasePOSApiView):
    permission_code = 'can_view_pos'

    def get(self, request, *args, **kwargs):
        limit = min(max(int(request.GET.get('limit', 100)), 1), 500)
        rows = (
            BetterposCashSession.objects.filter(event=self.event)
            .select_related('register', 'opened_by', 'closed_by')
            .order_by('-opened_at')[:limit]
        )
        return JsonResponse(
            {
                'sessions': [
                    {
                        'id': row.id,
                        'register_id': row.register_id,
                        'register_name': row.register.name,
                        'status': row.status,
                        'opened_at': row.opened_at.isoformat() if row.opened_at else None,
                        'closed_at': row.closed_at.isoformat() if row.closed_at else None,
                        'opened_by': row.opened_by.get_full_name() or row.opened_by.email,
                        'closed_by': (row.closed_by.get_full_name() or row.closed_by.email) if row.closed_by else '',
                        'opening_float': str(row.opening_float),
                        'expected_cash': str(row.expected_cash),
                        'counted_cash': str(row.counted_cash) if row.counted_cash is not None else None,
                        'difference': str(row.difference),
                    }
                    for row in rows
                ]
            }
        )


class TransactionsListView(BasePOSApiView):
    permission_code = 'can_view_pos'

    def get(self, request, *args, **kwargs):
        limit = min(max(int(request.GET.get('limit', 200)), 1), 1000)
        channel = request.GET.get('channel')
        state = request.GET.get('state')

        qs = (
            BetterposTransaction.objects.filter(event=self.event)
            .select_related('order', 'register', 'operator', 'session')
            .order_by('-created_at')
        )
        if channel:
            qs = qs.filter(channel=channel)
        if state:
            qs = qs.filter(state=state)

        qs = qs[:limit]
        return JsonResponse(
            {
                'transactions': [
                    {
                        'id': tx.id,
                        'order_code': tx.order.code,
                        'amount': str(tx.order.total),
                        'channel': tx.channel,
                        'state': tx.state,
                        'register_name': tx.register.name,
                        'operator_name': tx.operator.get_full_name() or tx.operator.email,
                        'session_id': tx.session_id,
                        'created_at': tx.created_at.isoformat(),
                    }
                    for tx in qs
                ]
            }
        )


class ReportsSummaryView(BasePOSApiView):
    permission_code = 'can_view_audit_pos'

    def get(self, request, *args, **kwargs):
        days = int(request.GET.get('days', 30))
        if days < 1:
            days = 1
        if days > 365:
            days = 365

        today = date.today()
        start = today - timedelta(days=days)

        transactions = BetterposTransaction.objects.filter(
            event=self.event,
            created_at__date__gte=start,
            created_at__date__lte=today,
            state__in=[BetterposTransaction.STATE_PAID, BetterposTransaction.STATE_PENDING],
        )

        total_sales = transactions.aggregate(total=Sum('order__total')).get('total') or Decimal('0.00')
        by_channel = []
        for channel, label in BetterposTransaction.CHANNEL_CHOICES:
            subset = transactions.filter(channel=channel)
            by_channel.append(
                {
                    'channel': channel,
                    'label': str(label),
                    'count': subset.count(),
                    'total': str(subset.aggregate(total=Sum('order__total')).get('total') or Decimal('0.00')),
                }
            )

        return JsonResponse(
            {
                'days': days,
                'from': start.isoformat(),
                'to': today.isoformat(),
                'total_count': transactions.count(),
                'total_sales': str(total_sales),
                'by_channel': by_channel,
            }
        )


class AuditFeedView(BasePOSApiView):
    permission_code = 'can_view_audit_pos'

    def get(self, request, *args, **kwargs):
        limit = int(request.GET.get('limit', 100))
        rows = BetterposActionLog.objects.filter(event=self.event).select_related('actor', 'register', 'session', 'order', 'payment')[:limit]
        return JsonResponse(
            {
                'actions': [
                    {
                        'id': row.id,
                        'action_type': row.action_type,
                        'actor_id': row.actor_id,
                        'register_id': row.register_id,
                        'session_id': row.session_id,
                        'order_id': row.order_id,
                        'payment_id': row.payment_id,
                        'payload': row.payload,
                        'created_at': row.created_at.isoformat(),
                    }
                    for row in rows
                ]
            }
        )


class TransactionsExportCSVView(BasePOSApiView):
    permission_code = 'can_view_pos'

    def get(self, request, *args, **kwargs):
        channel = request.GET.get('channel')
        state = request.GET.get('state')
        date_from = request.GET.get('date_from')
        date_to = request.GET.get('date_to')

        qs = (
            BetterposTransaction.objects.filter(event=self.event)
            .select_related('order', 'register', 'operator', 'session')
            .order_by('-created_at')
        )
        if channel:
            qs = qs.filter(channel=channel)
        if state:
            qs = qs.filter(state=state)
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="betterpos_transactions.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'transaction_id',
            'order_code',
            'amount',
            'channel',
            'state',
            'operator',
            'register',
            'session_id',
            'created_at',
        ])

        for tx in qs:
            writer.writerow([
                tx.id,
                tx.order.code,
                str(tx.order.total),
                tx.channel,
                tx.state,
                tx.operator.get_full_name() or tx.operator.email,
                tx.register.name,
                tx.session_id or '',
                tx.created_at.isoformat(),
            ])

        return response


class AuditExportCSVView(BasePOSApiView):
    permission_code = 'can_view_audit_pos'

    def get(self, request, *args, **kwargs):
        action_type = request.GET.get('action_type')
        date_from = request.GET.get('date_from')
        date_to = request.GET.get('date_to')

        qs = (
            BetterposActionLog.objects.filter(event=self.event)
            .select_related('actor', 'register', 'session', 'order', 'payment')
            .order_by('-created_at')
        )
        if action_type:
            qs = qs.filter(action_type=action_type)
        if date_from:
            qs = qs.filter(created_at__date__gte=date_from)
        if date_to:
            qs = qs.filter(created_at__date__lte=date_to)

        response = HttpResponse(content_type='text/csv')
        response['Content-Disposition'] = 'attachment; filename="betterpos_audit_log.csv"'

        writer = csv.writer(response)
        writer.writerow([
            'id',
            'created_at',
            'actor',
            'action_type',
            'register',
            'session_id',
            'order_id',
            'payment_id',
            'payload',
        ])

        for log in qs:
            writer.writerow([
                log.id,
                log.created_at.isoformat(),
                log.actor.get_full_name() or log.actor.email,
                log.action_type,
                log.register.name if log.register else '',
                log.session_id or '',
                log.order_id or '',
                log.payment_id or '',
                json.dumps(log.payload, ensure_ascii=True),
            ])

        return response
