import Link from "next/link"
import { Button } from "@/components/ui/button"

export default function Home() {
  // In a real app, you would check if the user is authenticated
  // For demo purposes, we'll just provide links to login/register

  return (
    <div className="flex flex-col items-center justify-center min-h-screen bg-gradient-to-b from-slate-50 to-slate-100 px-4">
      <div className="max-w-md w-full space-y-8 text-center">
        <div>
          <h1 className="text-4xl font-bold tracking-tight text-slate-900">我的AI-BOT</h1>
        </div>

        <div className="flex flex-col space-y-4">
          <Button asChild size="lg" className="w-full">
            <Link href="/login">Login</Link>
          </Button>
          <Button asChild variant="outline" size="lg" className="w-full">
            <Link href="/register">Register</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}