"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, Send, Loader2, CheckCircle, Clock, AlertCircle, Brain } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { toast } from "sonner";
import { formatDistanceToNow } from "@/lib/date-utils";
import { generateNextQuestion } from "@/lib/ai-service";

interface InterviewMessage {
  role: "assistant" | "user";
  content: string;
  questionIndex?: number;
  isFollowUp?: boolean;
}

interface InterviewAnswer {
  _id: string;
  interviewId: string;
  questionIndex: number;
  question: string;
  answer: string;
  followUpCount: number;
  createdAt: number;
}

type InterviewStatus = "setup" | "in_progress" | "completed" | "failed";

interface Interview {
  _id: string;
  userId: string;
  resumeText: string;
  jobDescription: string;
  status: InterviewStatus;
  plan?: { questions: string[] } | null;
  currentQuestionIndex: number;
  startedAt?: number;
  completedAt?: number;
  createdAt: number;
  updatedAt: number;
}

export default function InterviewPage() {
  const params = useParams();
  const router = useRouter();
  const interviewId = params.id as string;

  const interview = useQuery(api.interviews.getInterview, { interviewId }) as Interview | undefined;
  const answers = useQuery(api.answers.getAnswers, { interviewId });
  const saveAnswer = useMutation(api.answers.saveAnswer);
  const incrementQuestion = useMutation(api.answers.incrementQuestionIndex);
  const updateStatus = useMutation(api.interviews.updateInterviewStatus);

  const [messages, setMessages] = useState<InterviewMessage[]>([]);
  const [currentAnswer, setCurrentAnswer] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGeneratingQuestion, setIsGeneratingQuestion] = useState(false);
  const [isRecording, setIsRecording] = useState(false);

  useEffect(() => {
    if (interview && answers) {
      const initialMessages: InterviewMessage[] = [];
      
      if (interview.plan && Array.isArray(interview.plan.questions)) {
        interview.plan.questions.forEach((q: string, idx: number) => {
          initialMessages.push({
            role: "assistant",
            content: q,
            questionIndex: idx,
          });
          const answer = answers.find((a: InterviewAnswer) => a.questionIndex === idx);
          if (answer) {
            initialMessages.push({
              role: "user",
              content: answer.answer,
              questionIndex: idx,
            });
            if (answer.followUpCount > 0) {
              for (let i = 0; i < answer.followUpCount; i++) {
                initialMessages.push({
                  role: "assistant",
                  content: `[Follow-up ${i + 1} would appear here]`,
                  questionIndex: idx,
                  isFollowUp: true,
                });
              }
            }
          }
        });
      }
      setMessages(initialMessages);
    }
  }, [interview, answers]);

  useEffect(() => {
    if (interview && interview.status === "setup") {
      updateStatus({ interviewId, status: "in_progress" });
    }
  }, [interview, updateStatus, interviewId]);

  const currentQuestionIndex = interview?.currentQuestionIndex ?? 0;
  const currentQuestion = messages.find(
    (m) => m.role === "assistant" && m.questionIndex === currentQuestionIndex && !m.isFollowUp
  );

const handleSubmitAnswer = async () => {
    if (!currentAnswer.trim() || !currentQuestion || !interview) return;

    setIsSubmitting(true);
    try {
      await saveAnswer({
        interviewId,
        questionIndex: currentQuestionIndex,
        question: currentQuestion.content,
        answer: currentAnswer,
        followUpCount: 0,
      });

      setMessages((prev) => [...prev, { role: "user", content: currentAnswer, questionIndex: currentQuestionIndex }]);
      setCurrentAnswer("");

      // Prepare previous Q&A for context
      const previousQA = messages
        .filter((m) => m.questionIndex !== undefined && m.questionIndex < currentQuestionIndex)
        .map((m) => ({ question: m.content, answer: "" }))
        .filter((m) => m.question);

      // Get user answers for previous questions
      const userAnswers = messages.filter((m) => m.role === "user" && m.questionIndex !== undefined);
      const qaPairs = userAnswers
        .map((ua) => {
          const q = messages.find((m) => m.role === "assistant" && m.questionIndex === ua.questionIndex && !m.isFollowUp);
          return q ? { question: q.content, answer: ua.content } : null;
        })
        .filter((item): item is { question: string; answer: string } => item !== null);

      setIsGeneratingQuestion(true);
      try {
        const nextQ = await generateNextQuestion({
          resume_text: interview.resumeText,
          job_description: interview.jobDescription,
          current_question: currentQuestion.content,
          user_answer: currentAnswer,
          question_index: currentQuestionIndex,
          previous_qa: qaPairs,
        });

        if (nextQ.is_follow_up && nextQ.follow_up_count < 3) {
          // Add follow-up question
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: nextQ.question,
            questionIndex: currentQuestionIndex,
            isFollowUp: true,
          }]);
          // Update follow-up count in the answer
          const existingAnswer = answers.find((a: InterviewAnswer) => a.questionIndex === currentQuestionIndex);
          if (existingAnswer) {
            await saveAnswer({
              interviewId,
              questionIndex: currentQuestionIndex,
              question: currentQuestion.content,
              answer: currentAnswer,
              followUpCount: nextQ.follow_up_count,
            });
          }
        } else {
          // Move to next question
          await incrementQuestion({ interviewId });
        }
        toast.success("Answer saved! Generating next question...");
      } catch (aiError) {
        console.error("AI question generation failed:", aiError);
        // Fallback: just increment question
        await incrementQuestion({ interviewId });
        toast.error("Failed to generate follow-up. Moving to next question.");
      } finally {
        setIsGeneratingQuestion(false);
      }
    } catch (error) {
      console.error(error);
      toast.error("Failed to save answer");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSkip = async () => {
    if (!currentQuestion) return;
    setIsSubmitting(true);
    try {
      await incrementQuestion({ interviewId });
      toast.success("Question skipped");
    } catch (error) {
      toast.error("Failed to skip");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      await updateStatus({ interviewId, status: "completed" });
      toast.success("Interview completed! Generating report...");
      router.push(`/interview/${interviewId}/report`);
    } catch (error) {
      toast.error("Failed to finish interview");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (!interview) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  const progress = interview.plan && Array.isArray(interview.plan.questions)
    ? Math.round(((currentQuestionIndex + 1) / interview.plan.questions.length) * 100)
    : 0;

  const statusConfig: Record<InterviewStatus, { label: string; color: string; bg: string }> = {
    setup: { label: "Setup", color: "text-muted-foreground", bg: "bg-muted" },
    in_progress: { label: "In Progress", color: "text-primary", bg: "bg-primary/10" },
    completed: { label: "Completed", color: "text-green-600", bg: "bg-green-600/10" },
    failed: { label: "Failed", color: "text-destructive", bg: "bg-destructive/10" },
  };

  const config = statusConfig[interview.status];

  return (
    <div className="flex h-screen flex-col">
      <header className="border-b bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="container flex h-16 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Link href="/dashboard" className="text-muted-foreground hover:text-foreground">
              <ArrowLeft className="h-5 w-5" />
            </Link>
            <div>
              <h1 className="font-semibold">Interview Session</h1>
              <p className="text-sm text-muted-foreground">
                Question {currentQuestionIndex + 1} of {interview.plan && Array.isArray(interview.plan.questions) ? interview.plan.questions.length : "?"}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <span className={config.bg + " " + config.color + " rounded-full px-3 py-1 text-sm font-medium flex items-center gap-1"}>
              <Clock className="h-3 w-3" />
              {config.label}
            </span>
            <div className="w-48 h-2 bg-muted rounded-full overflow-hidden">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
            <span className="text-sm text-muted-foreground w-10 text-right">{progress}%</span>
          </div>
        </div>
      </header>

      <main className="flex-1 overflow-y-auto p-6">
        <div className="container max-w-3xl">
          <div className="space-y-6" role="log" aria-live="polite">
            {messages.map((msg, idx) => (
              <div key={idx} className={msg.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div className={cn(
                  "max-w-[85%] rounded-2xl px-4 py-3",
                  msg.role === "assistant"
                    ? "bg-muted rounded-bl-sm"
                    : "bg-primary text-primary-foreground rounded-br-sm"
                )}>
                  {msg.isFollowUp && (
                    <span className="text-xs text-muted-foreground/70 block mb-1">Follow-up question</span>
                  )}
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}

            {currentQuestion && (
              <div className="flex justify-start">
                <div className="max-w-[85%] bg-muted rounded-2xl rounded-bl-sm px-4 py-3 border border-primary/20">
                  <p className="font-medium">{currentQuestion.content}</p>
                </div>
              </div>
            )}

            <div className="flex justify-end">
              <div className="max-w-[85%]">
                <Textarea
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  placeholder="Type your answer here..."
                  rows={4}
                  disabled={isSubmitting || !currentQuestion}
                  className="mb-3"
                />
                <div className="flex gap-2 justify-end">
                  {currentQuestion ? (
                    <>
                      <Button
                        variant="outline"
                        onClick={handleSkip}
                        disabled={isSubmitting}
                      >
                        Skip
                      </Button>
                      <Button
                        onClick={handleSubmitAnswer}
                        disabled={isSubmitting || !currentAnswer.trim()}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Submit Answer
                      </Button>
                    </>
                  ) : (
                    <Button onClick={handleFinish} disabled={isSubmitting} variant="default">
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Finish Interview
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

function cn(...classes: Array<string | boolean | undefined | null>) {
  return classes.filter(Boolean).join(" ");
}