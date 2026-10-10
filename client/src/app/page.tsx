"use client";

import Link from "next/link";
import { SignInButton, SignUpButton } from "@clerk/nextjs";
import { Sparkles, FileText, Brain, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";

export default function Home() {
  return (
    <div className="flex min-h-screen flex-col bg-background">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-40">
        <div className="container flex h-16 items-center justify-between px-4">
          <span className="text-xl font-semibold">Interview AI</span>
          <div className="flex items-center gap-4">
            <SignInButton mode="modal">
              <Button variant="ghost">Sign In</Button>
            </SignInButton>
            <SignUpButton mode="modal">
              <Button>Get Started</Button>
            </SignUpButton>
          </div>
        </div>
      </header>

      <main className="flex-1">
        <section className="container py-20 md:py-32 px-4 text-center">
          <div className="max-w-3xl mx-auto">
            <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-8">
              <Sparkles className="h-4 w-4" />
              AI-Powered Mock Interviews
            </div>
            <h1 className="text-4xl md:text-6xl font-semibold tracking-tight mb-6">
              Ace Your Next Interview with <span className="text-primary">AI Practice</span>
            </h1>
            <p className="text-lg md:text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
              Upload your resume, paste a job description, and get personalized mock interviews 
              with adaptive follow-up questions and detailed feedback reports.
            </p>
            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <SignUpButton mode="modal">
                <Button size="lg" className="gap-2">
                  Start Free Interview
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </SignUpButton>
              <SignInButton mode="modal">
                <Button size="lg" variant="outline">Sign In</Button>
              </SignInButton>
            </div>
          </div>
        </section>

        <section className="container py-16 px-4">
          <div className="grid md:grid-cols-3 gap-6 max-w-5xl mx-auto">
            <Card>
              <CardContent className="pt-6">
                <div className="mx-auto w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <FileText className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-center mb-2">Resume & JD Analysis</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Upload your resume and paste the job description. Our AI analyzes both to 
                  create a tailored interview plan.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="mx-auto w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Brain className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-center mb-2">Adaptive Follow-ups</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Questions adapt to your answers in real-time. Get follow-up questions that 
                  dig deeper into your experience and knowledge.
                </p>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-6">
                <div className="mx-auto w-12 h-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                  <Sparkles className="h-6 w-6 text-primary" />
                </div>
                <h3 className="text-lg font-semibold text-center mb-2">Detailed Reports</h3>
                <p className="text-sm text-muted-foreground text-center">
                  Receive comprehensive feedback with scores, strengths, weaknesses, and 
                  actionable improvement recommendations.
                </p>
              </CardContent>
            </Card>
          </div>
        </section>

        <section className="container py-16 px-4">
          <div className="max-w-3xl mx-auto text-center">
            <h2 className="text-3xl font-semibold mb-4">How It Works</h2>
            <div className="grid md:grid-cols-3 gap-8 mt-10">
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-primary">1</div>
                <h3 className="font-semibold mb-2">Setup</h3>
                <p className="text-sm text-muted-foreground">Upload resume + paste job description</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-primary">2</div>
                <h3 className="font-semibold mb-2">Interview</h3>
                <p className="text-sm text-muted-foreground">Answer AI-generated questions with adaptive follow-ups</p>
              </div>
              <div className="text-center">
                <div className="w-16 h-16 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4 text-2xl font-bold text-primary">3</div>
                <h3 className="font-semibold mb-2">Report</h3>
                <p className="text-sm text-muted-foreground">Get detailed feedback & improvement plan</p>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t py-8">
        <div className="container px-4 text-center text-sm text-muted-foreground">
          <p>Interview AI — AI-powered interview preparation platform</p>
        </div>
      </footer>
    </div>
  );
}