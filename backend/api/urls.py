"""URL configuration for api project.

The `urlpatterns` list routes URLs to views. For more information please see:
    https://docs.djangoproject.com/en/5.2/topics/http/urls/

Examples:
Function views
    1. Add an import:  from my_app import views
    2. Add a URL to urlpatterns:  path('', views.home, name='home')
Class-based views
    1. Add an import:  from other_app.views import Home
    2. Add a URL to urlpatterns:  path('', Home.as_view(), name='home')
Including another URLconf
    1. Import the include() function: from django.urls import include, path
    2. Add a URL to urlpatterns:  path('blog/', include('blog.urls'))

"""

from django.contrib import admin
from django.urls import path

from api.api import api
from api.monitoring_views import (
    health_check,
    health_detailed,
    metrics_json,
    metrics_prometheus,
    monitoring_dashboard
)

urlpatterns = [
    path("admin/", admin.site.urls),
    path("/monitoring/", monitoring_dashboard, name="monitoring_dashboard"),
    path("/monitoring/health/", health_check, name="health_check"),
    path("/monitoring/health/detailed/", health_detailed, name="health_detailed"),
    path("/monitoring/metrics/", metrics_json, name="metrics_json"),
    path("/monitoring/metrics/prometheus/", metrics_prometheus, name="metrics_prometheus"),
    path("", api.urls),
]
