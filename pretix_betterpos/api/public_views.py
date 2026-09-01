import json

from django.http import Http404
from django.http import JsonResponse
from django.utils import timezone
from django.views import View
from pretix.base.models import Item

from pretix_betterpos.auth import get_event_from_request
from pretix_betterpos.models import BetterposSelfserviceCheckout
from pretix_betterpos.services import BetterPOSError, CartService, ValidationError
from pretix_betterpos.services.selfservice_service import SelfserviceCheckoutService


class BasePublicApiView(View):
    def dispatch(self, request, *args, **kwargs):
        self.event = get_event_from_request(request, kwargs)
        if not self.event.settings.get('betterpos_selfservice_enabled', as_type=bool):
            raise Http404()
        return super().dispatch(request, *args, **kwargs)

    @staticmethod
    def parse_json(request):
        try:
            return json.loads(request.body.decode('utf-8') or '{}')
        except (json.JSONDecodeError, UnicodeDecodeError):
            raise ValidationError('Invalid JSON payload')

    @staticmethod
    def error_response(exc):
        status = 400
        return JsonResponse({'error': str(exc)}, status=status)


class PublicCatalogView(BasePublicApiView):
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


class PublicQuoteView(BasePublicApiView):
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


class PublicCheckoutStartView(BasePublicApiView):
    def post(self, request, *args, **kwargs):
        try:
            payload = self.parse_json(request)
            cart_totals = CartService.compute_cart_totals(
                event=self.event,
                lines=payload.get('lines', []),
                discount=payload.get('discount'),
            )
            checkout = SelfserviceCheckoutService.start_checkout(
                request=request,
                event=self.event,
                cart_totals=cart_totals,
                phone=payload.get('phone'),
                locale=payload.get('locale', 'pt-pt'),
                provider='eupago_mbway',
            )
            return JsonResponse(
                {
                    'checkout_token': checkout.token,
                    'order_code': checkout.order.code,
                    'state': checkout.state,
                    'expires_at': checkout.expires_at.isoformat(),
                },
                status=201,
            )
        except BetterPOSError as exc:
            return self.error_response(exc)


class PublicCheckoutStatusView(BasePublicApiView):
    def get(self, request, token, *args, **kwargs):
        try:
            checkout = BetterposSelfserviceCheckout.objects.select_related('order', 'payment').get(
                event=self.event,
                token=token,
            )
            checkout = SelfserviceCheckoutService.get_checkout_status(checkout=checkout)
            remaining_seconds = max(0, int((checkout.expires_at - timezone.now()).total_seconds()))
            return JsonResponse(
                {
                    'checkout_token': checkout.token,
                    'order_code': checkout.order.code,
                    'state': checkout.state,
                    'expires_at': checkout.expires_at.isoformat(),
                    'remaining_seconds': remaining_seconds,
                }
            )
        except BetterposSelfserviceCheckout.DoesNotExist:
            return JsonResponse({'error': 'Checkout not found'}, status=404)
        except BetterPOSError as exc:
            return self.error_response(exc)
