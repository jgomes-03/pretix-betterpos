from decimal import Decimal
from types import SimpleNamespace

from pretix_betterpos.services import order_service, selfservice_service


class _EmptyQuerySet(list):
    def select_related(self, *args, **kwargs):
        return self

    def order_by(self, *args, **kwargs):
        return self

    def exists(self):
        return False


def test_create_order_from_cart_creates_a_position_per_unit(monkeypatch):
    created_positions = []

    class _OrderManager:
        def create(self, **kwargs):
            order = SimpleNamespace(**kwargs)
            order.positions = SimpleNamespace(
                aggregate=lambda **_kwargs: {'sum': sum(Decimal(p['price']) for p in created_positions)}
            )
            order.fees = SimpleNamespace(aggregate=lambda **_kwargs: {'sum': Decimal('0.00')})
            order.save = lambda **_kwargs: None
            order.create_transactions = lambda **_kwargs: None
            return order

    class _Order:
        STATUS_PAID = 'paid'
        STATUS_EXPIRED = 'expired'
        STATUS_CANCELED = 'canceled'
        STATUS_PENDING = 'pending'
        objects = _OrderManager()

    class _OrderPositionManager:
        def create(self, **kwargs):
            created_positions.append(kwargs)
            return SimpleNamespace(**kwargs)

    class _BetterposTransactionManager:
        def filter(self, **kwargs):
            return _EmptyQuerySet()

        def create(self, **kwargs):
            tx = SimpleNamespace(**kwargs, id=1)
            tx.save = lambda **_kwargs: None
            return tx

    class _BetterposTransaction:
        STATE_PENDING = 'pending'
        STATE_PAID = 'paid'
        STATE_EXPIRED = 'expired'
        STATE_ORDER_CREATED = 'order_created'
        CHANNEL_CASH = 'cash'
        objects = _BetterposTransactionManager()

    monkeypatch.setattr(order_service, 'Order', _Order)
    monkeypatch.setattr(order_service, 'OrderPosition', SimpleNamespace(objects=_OrderPositionManager()))
    monkeypatch.setattr(order_service, 'BetterposTransaction', _BetterposTransaction)
    monkeypatch.setattr(order_service.AuditService, 'log', lambda **kwargs: None)
    monkeypatch.setattr(
        order_service.OrderOrchestrationService,
        '_resolve_sales_channel',
        staticmethod(lambda _event: SimpleNamespace()),
    )
    monkeypatch.setattr(
        order_service.OrderOrchestrationService,
        '_normalize_order_phone',
        staticmethod(lambda _event, _phone: '+351912345678'),
    )
    monkeypatch.setattr(
        order_service.OrderOrchestrationService,
        '_normalize_order_locale',
        staticmethod(lambda _locale: 'pt-pt'),
    )

    order, _tx = order_service.OrderOrchestrationService.create_order_from_cart(
        event=SimpleNamespace(),
        user=SimpleNamespace(pk=1, email='operator@example.org', username='operator'),
        register=SimpleNamespace(),
        session=SimpleNamespace(status='open', STATUS_OPEN='open'),
        cart_totals={
            'lines': [
                {
                    'item_id': 11,
                    'variation_id': None,
                    'unit_price': '11.09',
                    'quantity': 3,
                }
            ],
            'subtotal': '33.27',
            'discount': '0.00',
            'total': '33.27',
        },
        phone='+351912345678',
    )

    assert len(created_positions) == 3
    assert [p['positionid'] for p in created_positions] == [1, 2, 3]
    assert order.total == Decimal('33.27')


def test_selfservice_checkout_creates_a_position_per_unit(monkeypatch):
    created_positions = []

    class _OrderManager:
        def create(self, **kwargs):
            order = SimpleNamespace(**kwargs)
            order.positions = SimpleNamespace(
                aggregate=lambda **_kwargs: {'sum': sum(Decimal(p['price']) for p in created_positions)}
            )
            order.fees = SimpleNamespace(aggregate=lambda **_kwargs: {'sum': Decimal('0.00')})
            order.save = lambda **_kwargs: None
            order.create_transactions = lambda **_kwargs: None
            return order

    class _Order:
        STATUS_PENDING = 'pending'
        objects = _OrderManager()

    class _OrderPositionManager:
        def create(self, **kwargs):
            created_positions.append(kwargs)
            return SimpleNamespace(**kwargs)

    class _SelfserviceCheckoutManager:
        def create(self, **kwargs):
            checkout = SimpleNamespace(**kwargs)
            checkout.save = lambda **_kwargs: None
            checkout.updated_at = None
            return checkout

    class _SelfserviceCheckout:
        STATE_CREATED = 'created'
        STATE_PENDING = 'pending'
        objects = _SelfserviceCheckoutManager()

        @staticmethod
        def make_token():
            return 'token'

    monkeypatch.setattr(selfservice_service, 'Order', _Order)
    monkeypatch.setattr(selfservice_service, 'OrderPosition', SimpleNamespace(objects=_OrderPositionManager()))
    monkeypatch.setattr(selfservice_service, 'BetterposSelfserviceCheckout', _SelfserviceCheckout)
    monkeypatch.setattr(selfservice_service, 'Item', SimpleNamespace(objects=SimpleNamespace(get=lambda **kwargs: SimpleNamespace())))
    monkeypatch.setattr(
        selfservice_service.SelfserviceCheckoutService,
        '_normalize_phone',
        staticmethod(lambda _event, _phone: '+351912345678'),
    )
    monkeypatch.setattr(
        selfservice_service.SelfserviceCheckoutService,
        '_initiate_eupago',
        staticmethod(lambda request, checkout, provider='eupago_mbway': (SimpleNamespace(), {})),
    )
    monkeypatch.setattr(
        selfservice_service.OrderOrchestrationService,
        '_resolve_sales_channel',
        staticmethod(lambda _event: SimpleNamespace()),
    )
    monkeypatch.setattr(
        selfservice_service.OrderOrchestrationService,
        '_normalize_order_locale',
        staticmethod(lambda _locale: 'pt-pt'),
    )

    selfservice_service.SelfserviceCheckoutService.start_checkout(
        request=SimpleNamespace(path='/', build_absolute_uri=lambda _path: 'https://example.org/'),
        event=SimpleNamespace(),
        cart_totals={
            'lines': [
                {
                    'item_id': 11,
                    'variation_id': None,
                    'unit_price': '11.09',
                    'quantity': 3,
                }
            ],
            'subtotal': '33.27',
            'discount': '0.00',
            'total': '33.27',
        },
        phone='+351912345678',
    )

    assert len(created_positions) == 3
    assert [p['positionid'] for p in created_positions] == [1, 2, 3]
