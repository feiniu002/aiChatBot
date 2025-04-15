from django.urls import path
from . import views

urlpatterns = [
    path('chat/completion/', views.chat_completion, name='chat_completion'),
    path('chats/', views.chat_list, name='chat-list'),
    path('chats/<int:chat_id>/messages/', views.chat_messages, name='chat-messages'),
    path('auth/register/', views.register, name='register'),
    path('auth/login/', views.login, name='login'),
]
