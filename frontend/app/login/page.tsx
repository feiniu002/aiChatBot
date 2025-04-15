"use client"

import type React from "react"

import { useState } from "react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card"
import { AlertCircle } from "lucide-react"
import { Alert, AlertDescription } from "@/components/ui/alert"

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setError("")

    try {
      // 测试账号检查
      if (email === "user@example.com" && password === "password") {
        localStorage.setItem("isLoggedIn", "true")
        localStorage.setItem("isTestUser", "true")
        router.push("/chat")
        return
      }

      console.log('正在发送登录请求...')  // 调试日志
      const response = await fetch("http://localhost:8000/api/auth/login/", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      })

      console.log('收到响应:', response.status)  // 调试日志

      if (!response.ok) {
        const errorText = await response.text()  // 先获取原始响应文本
        console.log('错误响应:', errorText)  // 调试日志
        
        let errorMessage = '登录失败'
        try {
          const errorData = JSON.parse(errorText)
          errorMessage = errorData.detail || errorMessage
        } catch (e) {
          console.error('解析错误响应失败:', e)
        }
        
        throw new Error(errorMessage)
      }

      const data = await response.json()
      console.log('登录成功:', data)  // 调试日志
      
      // 保存认证信息
      localStorage.setItem("token", data.token)
      localStorage.setItem("isLoggedIn", "true")
      localStorage.setItem("isTestUser", "false")
      
      // 跳转到聊天页面
      router.push("/chat")
    } catch (err) {
      console.error('登录错误:', err)  // 调试日志
      setError(err instanceof Error ? err.message : "登录失败，请重试")
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-slate-50 px-4">
      
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold">登录</CardTitle>
          <CardDescription>
            输入邮箱和密码登录账号
            <div className="mt-2 text-sm text-slate-500">
              测试账号：user@example.com / password
            </div>
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label htmlFor="email">邮箱</Label>
              <Input
                id="email"
                type="email"
                placeholder="name@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">密码</Label>
                <Link href="#" className="text-sm text-slate-500 hover:text-slate-900">
                  忘记密码？
                </Link>
              </div>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? "登录中..." : "登录"}
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <div className="text-sm text-center w-full">
            还没有账号？{" "}
            <Link href="/register" className="text-slate-900 font-medium hover:underline">
              注册
            </Link>
          </div>
        </CardFooter>
      </Card>
    </div>
  )
}
