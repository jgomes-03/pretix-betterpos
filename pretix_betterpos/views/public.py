from django.utils.decorators import method_decorator
from django.http import Http404
from django.views.decorators.csrf import ensure_csrf_cookie
from django.views.generic import TemplateView


@method_decorator(ensure_csrf_cookie, name='dispatch')
class PublicBuyView(TemplateView):
    template_name = 'pretixplugins/pretix_betterpos/public/buy.html'

    def dispatch(self, request, *args, **kwargs):
        event = getattr(request, 'event', None)
        if not event or not event.settings.get('betterpos_selfservice_enabled', as_type=bool):
            raise Http404()
        return super().dispatch(request, *args, **kwargs)

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        event = self.request.event
        base_path = self.request.path.rstrip('/') or self.request.path
        context['event'] = event
        context['base_path'] = base_path
        context['api_base'] = f'{base_path}/api'
        return context
