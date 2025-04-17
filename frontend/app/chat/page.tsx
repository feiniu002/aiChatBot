"use client"

import { useEffect, useRef, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { Send, LogOut, Bot } from "lucide-react"
import { Message } from "ai"
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'

interface ChatHistory {
  id: string;
  title: string;
  created_at: string;
}

export default function ChatPage() {
  const router = useRouter()
  const [isAuthenticated, setIsAuthenticated] = useState(true)
  const messagesEndRef = useRef<HTMLDivElement>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [chatHistories, setChatHistories] = useState<ChatHistory[]>([])
  const [currentChatId, setCurrentChatId] = useState<string | null>(null)
  const [input, setInput] = useState("")
  const [isLoading, setIsLoading] = useState(false)
  const [currentAssistantMessage, setCurrentAssistantMessage] = useState("")
  const [isGenerating, setIsGenerating] = useState(false)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setInput(e.target.value)
  }

  // 获取对话历史
  const fetchChatHistories = async () => {
    try {
      const token = localStorage.getItem("token")
      const response = await fetch("http://localhost:8000/api/chats/", {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`  // 添加认证头
        }
      })

      if (!response.ok) {
        throw new Error("获取对话历史失败")
      }

      const data = await response.json()
      console.log('获取到的对话历史:', data)  // 调试日志
      setChatHistories(data)
      
      // 如果有对话历史且没有当前对话ID，加载最新的对话
      if (data.length > 0 && !currentChatId) {
        await loadChatMessages(data[0].id)
      }
    } catch (error) {
      console.error("获取对话历史失败:", error)
    }
  }

  // 加载特定对话的消息
  const loadChatMessages = async (chatId: string) => {
    try {
      console.log('加载对话消息:', chatId)  // 调试日志
      const token = localStorage.getItem("token")
      const response = await fetch(`http://localhost:8000/api/chats/${chatId}/messages/`, {
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`  // 添加认证头
        }
      })

      if (!response.ok) {
        throw new Error("获取对话消息失败")
      }

      const data = await response.json()
      console.log('获取到的消息:', data)  // 调试日志
      
      // 确保消息按时间顺序排列
      const sortedMessages = data.sort((a: any, b: any) => 
        new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
      )

      setMessages(sortedMessages.map((msg: any) => ({
        id: msg.id.toString(),
        content: msg.content,
        role: msg.role
      })))
      setCurrentChatId(chatId)
    } catch (error) {
      console.error("获取对话消息失败:", error)
    }
  }

  // 添加调试用的 effect
  useEffect(() => {
    console.log('当前对话ID:', currentChatId)
    console.log('当前消息列表:', messages)
  }, [currentChatId, messages])

  // 在组件加载时获取对话历史
  useEffect(() => {
    fetchChatHistories()
  }, [])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!input.trim() || isLoading) return

    setIsLoading(true)
    setIsGenerating(true)

    const userMessage: Message = {
      id: Date.now().toString(),
      content: input.trim(),
      role: 'user'
    }
    setMessages(prev => [...prev, userMessage])
    setInput("")
    setCurrentAssistantMessage("")

    try {
      // 准备发送的消息数据
      const requestData = {
        messages: [...messages, userMessage].map(msg => ({
          content: msg.content,
          role: msg.role
        })),
        chat_id: currentChatId
      }
      console.log('发送请求数据:', requestData)  // 调试日志

      const token = localStorage.getItem("token")
      const response = await fetch("http://localhost:8000/api/chat/completion/", {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`  // 确保这里有正确的 token
        },
        body: JSON.stringify(requestData)
      })

      if (!response.ok) {
        throw new Error(`请求失败: ${response.status} ${response.statusText}`)
      }

      const reader = response.body?.getReader()
      const decoder = new TextDecoder()

      if (!reader) {
        throw new Error('无法读取响应')
      }

      let currentMessage = ""

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        const chunk = decoder.decode(value)
        setIsGenerating(false)
        console.log('收到的原始数据块:', chunk)

        const lines = chunk.split('\n')
        
        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = line.slice(5).trim()
            console.log('处理的数据行:', data)

            if (data === '[DONE]') {
              // 流结束，添加完整的助手消息
              const assistantMessage: Message = {
                id: Date.now().toString(),
                content: currentMessage,
                role: 'assistant'
              }
              setMessages(prev => [...prev, assistantMessage])
              setCurrentAssistantMessage("")
              
              // 在对话完成后重新获取对话历史
              await fetchChatHistories()
              continue
            }

            try {
              if (data) {
                const parsed = JSON.parse(data)
                console.log('解析后的数据:', parsed)

                if (parsed.content) {
                  currentMessage += parsed.content
                  setCurrentAssistantMessage(currentMessage)
                }
                // 如果返回了chat_id，更新当前对话ID
                if (parsed.chat_id && !currentChatId) {
                  setCurrentChatId(parsed.chat_id)
                }
              }
            } catch (e) {
              console.error('解析消息失败:', e)
              console.error('失败的数据:', data)
            }
          }
        }
      }
    } catch (error) {
      console.error('发生错误:', error)
    } finally {
      setIsLoading(false)
      setIsGenerating(false)
    }
  }

  // 滚动到底部
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages, currentAssistantMessage])

  const handleLogout = () => {
    // 清除所有存储的认证信息
    localStorage.removeItem("token")
    localStorage.removeItem("isLoggedIn")
    localStorage.removeItem("isTestUser")
    
    // 清除消息历史
    setMessages([])
    setCurrentAssistantMessage("")
    
    // 重定向到登录页面
    router.push("/login")
  }

  const handleNewChat = () => {
    setCurrentChatId(null)
    setMessages([])
    setCurrentAssistantMessage("")
  }

  if (!isAuthenticated) {
    return null // Don't render anything until authentication check is complete
  }

  return (
    <div className="flex flex-col h-screen bg-slate-50">
      <header className="border-b bg-white">
        <div className="container flex items-center justify-between h-16 px-4">
          <div className="flex items-center gap-2">
            <Bot className="h-6 w-6 text-slate-900" />
            <h1 className="text-xl font-bold">AI-BOT</h1>
          </div>
          <Button variant="ghost" size="icon" onClick={handleLogout}>
            <LogOut className="h-5 w-5" />
            <span className="sr-only">退出登录</span>
          </Button>
        </div>
      </header>

      <div className="flex-1 container max-w-7xl mx-auto p-4 overflow-hidden flex flex-col md:flex-row gap-4">
        {/* Chat History Sidebar */}
        <div className="w-full md:w-64 flex-shrink-0 mb-4 md:mb-0">
          <Card className="h-full">
            <CardHeader className="border-b bg-white">
              <CardTitle className="text-sm">对话历史</CardTitle>
            </CardHeader>
            <CardContent className="p-2">
              <div className="space-y-1">
                <Button
                  key="new"
                  variant="secondary"
                  className="w-full justify-start text-left h-auto py-3 px-3"
                  onClick={handleNewChat}
                >
                  <div className="flex flex-col items-start">
                    <span className="truncate w-full">新对话</span>
                    <span className="text-xs text-slate-500">开始新对话</span>
                  </div>
                </Button>
                {chatHistories.map((chat) => (
                  <Button
                    key={chat.id}
                    variant={currentChatId === chat.id ? "secondary" : "ghost"}
                    className="w-full justify-start text-left h-auto py-3 px-3"
                    onClick={() => loadChatMessages(chat.id)}
                  >
                    <div className="flex flex-col items-start">
                      <span className="truncate w-full">{chat.title}</span>
                      <span className="text-xs text-slate-500">
                        {new Date(chat.created_at).toLocaleString('zh-CN', {
                          year: 'numeric',
                          month: '2-digit',
                          day: '2-digit',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </span>
                    </div>
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Main Chat Area */}
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="border-b bg-white">
            <CardTitle>我与AI-BOT的聊天</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto p-4 space-y-4">
            {messages.length === 0 && !currentAssistantMessage ? (
              <div className="flex items-center justify-center h-full">
                <div className="text-center space-y-2">
                  <Bot className="h-12 w-12 mx-auto text-slate-400" />
                  <p className="text-slate-500">开始与AI助手对话</p>
                </div>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                    <div className={`flex gap-3 max-w-[80%] ${message.role === "user" ? "flex-row-reverse" : ""}`}>
                      <Avatar className={message.role === "assistant" ? "bg-slate-200" : "bg-slate-700"}>
                        <AvatarFallback>{message.role === "user" ? "U" : "AI"}</AvatarFallback>
                      </Avatar>
                      <div
                        className={`rounded-lg p-4 ${
                          message.role === "user" ? "bg-slate-100 text-slate-900" : "bg-slate-200 text-slate-900"
                        }`}
                      >
                        <div className="text-sm prose dark:prose-invert max-w-none [&_pre]:bg-gray-100 [&_pre]:p-4 [&_pre]:rounded-md [&_pre]:text-slate-900 [&_code]:text-sm [&_pre_code]:text-slate-900 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded-sm [&_p_code]:text-slate-900">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {message.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
                {isGenerating && (
                  <div className="flex justify-start">
                    <div className="flex gap-3 max-w-[80%]">
                      <Avatar className="bg-slate-200">
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                      <div className="rounded-lg p-4 bg-slate-200 text-slate-900">
                        <div className="flex items-center gap-2">
                          <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></div>
                          <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></div>
                          <div className="w-2 h-2 bg-slate-600 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></div>
                          <span className="ml-2 text-sm text-slate-600">正在生成...</span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
                {currentAssistantMessage && (
                  <div className="flex justify-start">
                    <div className="flex gap-3 max-w-[80%]">
                      <Avatar className="bg-slate-200">
                        <AvatarFallback>AI</AvatarFallback>
                      </Avatar>
                      <div className="rounded-lg p-4 bg-slate-200 text-slate-900">
                        <div className="text-sm prose dark:prose-invert max-w-none [&_pre]:bg-gray-100 [&_pre]:p-4 [&_pre]:rounded-md [&_pre]:text-slate-900 [&_code]:text-sm [&_pre_code]:text-slate-900 [&_code]:bg-gray-100 [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded-sm [&_p_code]:text-slate-900">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {currentAssistantMessage}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </>
            )}
            <div ref={messagesEndRef} />
          </CardContent>
          <CardFooter className="border-t p-4 bg-white">
            <form onSubmit={handleSubmit} className="flex w-full items-center space-x-2">
              <Input
                placeholder="Type your message..."
                value={input}
                onChange={handleInputChange}
                className="flex-1"
                disabled={isLoading}
              />
              <Button type="submit" size="icon" disabled={isLoading || !input.trim()}>
                <Send className="h-4 w-4" />
                <span className="sr-only">Send</span>
              </Button>
            </form>
          </CardFooter>
        </Card>
      </div>
    </div>
  )
}