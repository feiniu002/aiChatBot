import os
from django.shortcuts import render
from rest_framework import viewsets
from .models import Chat, Message
from .serializers import ChatSerializer, MessageSerializer
from rest_framework.decorators import api_view, permission_classes, renderer_classes
from rest_framework.response import Response
from rest_framework.renderers import BaseRenderer,JSONRenderer
from rest_framework.permissions import IsAuthenticated
from django.conf import settings
from django.http import StreamingHttpResponse
import queue
import threading
import asyncio
import json
from datetime import datetime
from django.contrib.auth import get_user_model, authenticate
from rest_framework import status
from rest_framework_simplejwt.tokens import RefreshToken
from django.core.exceptions import ObjectDoesNotExist
from django.views.decorators.http import require_http_methods
from asgiref.sync import sync_to_async
from django.views.decorators.csrf import csrf_exempt

from typing_extensions import TypedDict
from typing import Annotated

from langgraph.graph import StateGraph,START, END
from langgraph.graph.message import add_messages
from langchain_community.tools.tavily_search import TavilySearchResults
from langchain_core.messages import ToolMessage,SystemMessage
from langgraph.prebuilt import ToolNode, tools_condition
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel
from langchain_core.tools import tool
from langchain_deepseek import ChatDeepSeek
from openai import OpenAI
import requests
import pytz


# 添加自定义渲染器
class EventStreamRenderer(BaseRenderer):
    media_type = 'text/event-stream'
    format = 'text-event-stream'

    def render(self, data, accepted_media_type=None, renderer_context=None):
        return data

class State(TypedDict):
    messages: Annotated[list, add_messages]


graph_builder = StateGraph(State)


@tool
def get_current_time(timezone: str = "Asia/Shanghai") -> str:
    """获取指定时区的当前时间。
    
    参数:
        timezone: 时区名称，默认为"Asia/Shanghai"（北京时间）
    
    返回:
        当前时间的字符串表示
    """
    print("get_current_time函数被调用了！")  # 添加调试信息
    try:
        tz = pytz.timezone(timezone)
        current_time = datetime.now(tz)
        return f"当前时间是 {current_time.strftime('%Y-%m-%d %H:%M:%S')}，时区: {timezone}"
    except Exception as e:
        return f"获取时间失败: {str(e)}"

@tool
def get_weather(location: str) -> str:
    """获取指定位置的天气信息。
    
    参数:
        location: 城市名称，如"北京"、"上海"等
    
    返回:
        天气信息的字符串表示
    """
    print("get_weather函数被调用了！")  # 添加调试信息
    try:
        # 这里使用的是示例API，您需要替换为实际可用的天气API
        api_key = "bc09ab60095a4cdd9fd90603251504"  # 替换为您的API密钥
        
        # 添加中文城市名到英文名的映射
        city_mapping = {
            "北京": "Beijing",
            "上海": "Shanghai",
            "广州": "Guangzhou",
            "深圳": "Shenzhen",
            "杭州": "Hangzhou",
            "南京": "Nanjing",
            "成都": "Chengdu",
            "武汉": "Wuhan",
            "西安": "Xian",
            "重庆": "Chongqing",
            "天津": "Tianjin",
            "苏州": "Suzhou",
            "厦门": "Xiamen",
            "长沙": "Changsha",
            "青岛": "Qingdao"
        }
        
        # 尝试将中文城市名转换为英文
        if location in city_mapping:
            query_location = f"{city_mapping[location]},CN"
        else:
            # 如果找不到映射，尝试直接使用输入并添加国家代码
            query_location = f"{location},CN"
            
        print(f"查询位置: {query_location}")
        url = f"https://api.weatherapi.com/v1/current.json?key={api_key}&q={query_location}&aqi=no"
        
        response = requests.get(url)
        data = response.json()
        
        # 添加调试信息
        print(f"API响应: {data}")
        
        # 检查API响应是否包含错误信息
        if 'error' in data:
            return f"获取天气信息失败: {data['error']['message']}"
            
        weather = data['current']['condition']['text']
        temp = data['current']['temp_c']
        return f"{location}当前天气: {weather}，温度: {temp}°C"
        
    except Exception as e:
        import traceback
        print(f"天气API错误详情: {traceback.format_exc()}")
        return f"获取天气信息失败: {str(e)}"

weather_tool = get_weather
time_tool = get_current_time
tools = [weather_tool, time_tool]

llm = ChatDeepSeek(
    model="deepseek-chat",
    # temperature=0,
    # max_tokens=None,
    # timeout=None,
    # max_retries=2,
    api_key=settings.DEEPSEEK_API_KEY,
    # other params...
)

llm_with_tools = llm.bind_tools(tools)


def chatbot(state: State):
    return {"messages": [llm_with_tools.invoke(state["messages"])]}


graph_builder.add_node("chatbot", chatbot)

tool_node = ToolNode(tools=tools)
graph_builder.add_node("tools", tool_node)

graph_builder.add_conditional_edges(
    "chatbot",
    tools_condition,
)
# Any time a tool is called, we return to the chatbot to decide the next step
graph_builder.add_edge("tools", "chatbot")
graph_builder.add_edge(START, "chatbot")

memory = MemorySaver()
graph = graph_builder.compile(checkpointer=memory)

config = {"configurable": {"thread_id": "1"}}

user_input = "Hi there! My name is Will."

# The config is the **second positional argument** to stream() or invoke()!
events = graph.stream(
    {"messages": [{"role": "user", "content": user_input}]},
    config,
    stream_mode="values",
)
# for event in events:
#     event["messages"][-1].pretty_print()


client = OpenAI(
    api_key=settings.DEEPSEEK_API_KEY,
    base_url="https://api.deepseek.com"  # 修改为官方示例的地址
)

def generate_response(messages, chat, chat_id, client):
    try:
        # 只获取最后一条用户消息
        last_user_message = None
        for msg in reversed(messages):
            if msg['role'] == 'user':
                last_user_message = msg
                break
                
        if not last_user_message:
            yield f"data: {json.dumps({'error': '没有找到用户消息'})}\n\n"
            return
            
        print(f"处理最后一条用户消息: {last_user_message['content']}")
        
        # 使用 LangGraph 处理消息
        config = {"configurable": {"thread_id": str(chat_id)}}
        events = graph.stream(
            {"messages": [{"role": "user", "content": last_user_message['content']}]},
            config,
            stream_mode="values",
        )
        
        complete_assistant_message = ""
        
        for event in events:
            if not event.get("messages"):
                continue
                
            last_message = event["messages"][-1]
            
            # 添加调试信息
            print(f"消息类型: {type(last_message)}")
            if hasattr(last_message, "__dict__"):
                print(f"消息属性: {last_message.__dict__}")
            elif isinstance(last_message, dict):
                print(f"消息内容: {last_message}")
            
            # 处理 AIMessage 类型
            if hasattr(last_message, "__class__") and last_message.__class__.__name__ == "AIMessage":
                content = last_message.content
                if content:
                    complete_assistant_message += content
                    yield f"data: {json.dumps({'content': content, 'chat_id': chat_id})}\n\n"
            # 检查消息类型并适当处理
            elif hasattr(last_message, "type") and last_message.type == "assistant":
                content = last_message.content
                if content:
                    complete_assistant_message += content
                    yield f"data: {json.dumps({'content': content, 'chat_id': chat_id})}\n\n"
            # 处理字典类型的消息
            elif isinstance(last_message, dict) and last_message.get("role") == "assistant":
                content = last_message.get("content", "")
                if content:
                    complete_assistant_message += content
                    yield f"data: {json.dumps({'content': content, 'chat_id': chat_id})}\n\n"
        
        if complete_assistant_message:
            Message.objects.create(
                chat=chat,
                role='assistant',
                content=complete_assistant_message
            )
            
        yield "data: [DONE]\n\n"
        
    except Exception as e:
        print(f"LangGraph 调用错误: {str(e)}")
        import traceback
        print(traceback.format_exc())
        yield f"data: {json.dumps({'error': str(e)})}\n\n"

@csrf_exempt
@api_view(['POST'])
@permission_classes([IsAuthenticated])
@renderer_classes([JSONRenderer])
def chat_completion(request):
    try:
        # 添加明确的认证检查
        if not request.user.is_authenticated:
            return Response(
                {'error': '用户未认证，请重新登录'},
                status=401
            )

        # 确保用户是真实用户而不是 AnonymousUser
        if request.user.is_anonymous:
            return Response(
                {'error': '用户未登录，请先登录'},
                status=401
            )

        data = json.loads(request.body)
        messages = data.get('messages', [])
        chat_id = data.get('chat_id')

        print("\n开始请求Deepseek API...")
        print("收到的消息:", messages)

        if not chat_id:
            title = (messages[0]['content'][:50] + '...') if messages else "新对话"
            chat = Chat.objects.create(
                title=title,
                user=request.user  # 这里会使用已认证的用户
            )
            chat_id = chat.id
        else:
            try:
                chat = Chat.objects.get(id=chat_id, user=request.user)
            except Chat.DoesNotExist:
                chat = Chat.objects.create(
                    title="新对话",
                    user=request.user
                )
                chat_id = chat.id

        if messages:
            latest_message = messages[-1]
            Message.objects.create(
                chat=chat,
                role=latest_message['role'],
                content=latest_message['content']
            )

        response = StreamingHttpResponse(
            generate_response(messages, chat, chat_id, client),
            content_type='text/event-stream'
        )
        return response

    except Exception as e:
        print(f"视图函数错误: {str(e)}")
        return Response(
            {'error': str(e)},
            status=500
        )

User = get_user_model()

@api_view(['POST'])
def register(request):
    try:
        username = request.data.get('username')
        email = request.data.get('email')
        password = request.data.get('password')

        if not all([username, email, password]):
            return Response(
                {'detail': '用户名、邮箱和密码都是必填项'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 检查用户名是否已存在
        if User.objects.filter(username=username).exists():
            return Response(
                {'detail': '用户名已被使用'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 检查邮箱是否已存在
        if User.objects.filter(email=email).exists():
            return Response(
                {'detail': '该邮箱已被注册'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 创建新用户
        user = User.objects.create_user(
            username=username,
            email=email,
            password=password
        )

        return Response({
            'detail': '注册成功',
            'username': user.username,
            'email': user.email
        }, status=status.HTTP_201_CREATED)

    except Exception as e:
        return Response(
            {'detail': f'注册失败: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['POST'])
def login(request):
    try:
        email = request.data.get('email')
        password = request.data.get('password')

        if not all([email, password]):
            return Response(
                {'detail': '邮箱和密码都是必填项'},
                status=status.HTTP_400_BAD_REQUEST
            )

        # 获取用户模型
        User = get_user_model()
        
        try:
            # 通过邮箱查找用户
            user = User.objects.get(email=email)
        except User.DoesNotExist:
            return Response(
                {'detail': '用户不存在'},
                status=status.HTTP_404_NOT_FOUND
            )

        # 验证用户
        user = authenticate(username=user.username, password=password)
        if user is None:
            return Response(
                {'detail': '密码错误'},
                status=status.HTTP_401_UNAUTHORIZED
            )

        # 生成令牌
        refresh = RefreshToken.for_user(user)
        
        return Response({
            'token': str(refresh.access_token),
            'refresh': str(refresh),
            'username': user.username,
            'email': user.email
        })

    except Exception as e:
        return Response(
            {'detail': f'登录失败: {str(e)}'},
            status=status.HTTP_500_INTERNAL_SERVER_ERROR
        )

@api_view(['GET', 'POST'])
@permission_classes([IsAuthenticated])
def chat_list(request):
    try:
        if request.method == 'GET':
            # 只获取当前用户的对话
            chats = Chat.objects.filter(user=request.user).order_by('-created_at')[:10]
            chat_data = []
            for chat in chats:
                first_message = chat.messages.first()
                if first_message and first_message.role == 'user':
                    title = first_message.content[:30] + '...' if len(first_message.content) > 30 else first_message.content
                else:
                    title = chat.title

                created_time = chat.created_at.strftime("%Y-%m-%d %H:%M")
                
                chat_data.append({
                    'id': chat.id,
                    'title': title,
                    'created_at': created_time
                })
            return Response(chat_data)
        
        elif request.method == 'POST':
            # 创建新对话时关联当前用户
            title = request.data.get('title', '新对话')
            chat = Chat.objects.create(title=title, user=request.user)
            return Response({
                'id': chat.id,
                'title': title,
                'created_at': chat.created_at.strftime("%Y-%m-%d %H:%M")
            }, status=status.HTTP_201_CREATED)
    
    except Exception as e:
        print(f"Error in chat_list: {str(e)}")  # 添加调试日志
        return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)

@api_view(['GET'])
@permission_classes([IsAuthenticated])
def chat_messages(request, chat_id):
    try:
        chat = Chat.objects.get(id=chat_id)
        messages = chat.messages.all().order_by('created_at')
        return Response([{
            'id': msg.id,
            'content': msg.content,
            'role': msg.role,
            'created_at': msg.created_at
        } for msg in messages])
    
    except ObjectDoesNotExist:
        return Response({'detail': '对话不存在'}, status=status.HTTP_404_NOT_FOUND)
    except Exception as e:
        print(f"Error in chat_messages: {str(e)}")  # 添加调试日志
        return Response({'detail': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
