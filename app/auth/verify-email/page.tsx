import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { Brain, Mail } from "lucide-react"
import Link from "next/link"

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 p-4">
      <div className="w-full max-w-md">
        <div className="flex flex-col items-center mb-8">
          <div className="flex items-center mb-4">
            <Brain className="h-8 w-8 text-primary" />
            <span className="ml-2 text-2xl font-bold">ADHD Companion</span>
          </div>
        </div>

        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Mail className="h-6 w-6 text-primary" />
            </div>
            <CardTitle className="text-2xl">Check your email</CardTitle>
            <CardDescription>We've sent you a verification link to complete your registration.</CardDescription>
          </CardHeader>
          <CardContent className="text-center space-y-4">
            <p className="text-sm text-muted-foreground">
              Click the link in your email to verify your account and start using your ADHD companion.
            </p>
            <div className="text-sm">
              Didn't receive the email?{" "}
              <Link href="/auth/signup" className="underline underline-offset-4 hover:text-primary">
                Try again
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
