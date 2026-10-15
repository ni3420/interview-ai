"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { useQuery, useMutation } from "convex/react";
import { api } from "@/convex/_generated/api";
import { ArrowLeft, Send, Loader2, CheckCircle, Clock, Brain } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
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
  resumeText?: string;
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

  // Sync messages from database when interview or answers update
  useEffect(() => {
    if (interview && answers) {
      const initialMessages: InterviewMessage[] = [];
      const currentIdx = interview.currentQuestionIndex ?? 0;
      const questionsList = interview.plan?.questions || [];

      for (let idx = 0; idx <= currentIdx && idx < questionsList.length; idx++) {
        const qText = questionsList[idx];
        
        if (qText) {
          initialMessages.push({
            role: "assistant",
            content: qText,
            questionIndex: idx,
          });
        }

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
                content: `[Follow-up question ${i + 1}]`,
                questionIndex: idx,
                isFollowUp: true,
              });
            }
          }
        }
      }

      // eslint-disable-next-line react-hooks/set-state-in-effect -- deriving chat transcript from Convex query data
      setMessages(initialMessages);
    }
  }, [interview, answers]);

  useEffect(() => {
    if (interview && interview.status === "setup") {
      updateStatus({ interviewId, status: "in_progress" });
    }
  }, [interview, updateStatus, interviewId]);

  const currentQuestionIndex = interview?.currentQuestionIndex ?? 0;
  const totalQuestions = interview?.plan?.questions?.length || 0;
  const isCompleted = totalQuestions > 0 && currentQuestionIndex >= totalQuestions;
  
  const questionsList = interview?.plan?.questions || [];
  const currentQuestionText = questionsList[currentQuestionIndex];

  if (totalQuestions === 0) {
    return (
      <div className="flex h-screen flex-col items-center justify-center gap-4 px-6 text-center">
        <Brain className="h-12 w-12 text-muted-foreground" />
        <h1 className="text-2xl font-semibold">
          Interview questions are being prepared
        </h1>
        <p className="max-w-md text-muted-foreground">
          Your resume has been saved. Question generation will be available once
          resume processing is enabled.
        </p>
        <Button asChild>
          <Link href="/dashboard">Back to Dashboard</Link>
        </Button>
      </div>
    );
  }

  const handleSubmitAnswer = async () => {
    if (!currentAnswer.trim() || !currentQuestionText || !interview) return;

    setIsSubmitting(true);
    try {
      // 1. Save Answer to Database
      await saveAnswer({
        interviewId,
        questionIndex: currentQuestionIndex,
        question: currentQuestionText,
        answer: currentAnswer,
        followUpCount: 0,
      });

      // 2. Local State for UI updates
      const submittedAnswerText = currentAnswer;
      setCurrentAnswer("");
      setMessages((prev) => [...prev, { role: "user", content: submittedAnswerText, questionIndex: currentQuestionIndex }]);

      const userAnswers = messages.filter((m) => m.role === "user" && m.questionIndex !== undefined);
      const qaPairs = userAnswers
        .map((ua) => {
          const q = questionsList[ua.questionIndex ?? 0];
          return q ? { question: q, answer: ua.content } : null;
        })
        .filter((item): item is { question: string; answer: string } => item !== null);

      setIsGeneratingQuestion(true);
      
      try {
        const nextQ = await generateNextQuestion({
          resume_text: interview.resumeText ?? "",
          job_description: interview.jobDescription,
          current_question: currentQuestionText,
          user_answer: submittedAnswerText,
          question_index: currentQuestionIndex,
          previous_qa: qaPairs,
        });

        if (nextQ.is_follow_up && nextQ.follow_up_count < 3) {
          // Follow-up question stay on current index
          setMessages((prev) => [...prev, {
            role: "assistant",
            content: nextQ.question,
            questionIndex: currentQuestionIndex,
            isFollowUp: true,
          }]);
          
          await saveAnswer({
            interviewId,
            questionIndex: currentQuestionIndex,
            question: currentQuestionText,
            answer: submittedAnswerText,
            followUpCount: nextQ.follow_up_count,
          });
        } else {
          // 3. Move to Next Question & Update Progress
          await incrementQuestion({ interviewId });

          const nextIdx = currentQuestionIndex + 1;
          if (nextIdx < questionsList.length) {
            setMessages((prev) => [
              ...prev,
              {
                role: "assistant",
                content: questionsList[nextIdx],
                questionIndex: nextIdx,
              },
            ]);
          }
        }
        toast.success("Answer saved!");
      } catch (aiError) {
        console.error("AI generation failed:", aiError);
        // Fallback: Increment index on failure so user is never stuck
        await incrementQuestion({ interviewId });
        
        const nextIdx = currentQuestionIndex + 1;
        if (nextIdx < questionsList.length) {
          setMessages((prev) => [
            ...prev,
            {
              role: "assistant",
              content: questionsList[nextIdx],
              questionIndex: nextIdx,
            },
          ]);
        }
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
    setIsSubmitting(true);
    try {
      await incrementQuestion({ interviewId });
      
      const nextIdx = currentQuestionIndex + 1;
      if (nextIdx < questionsList.length) {
        setMessages((prev) => [
          ...prev,
          { role: "user", content: "[Skipped]", questionIndex: currentQuestionIndex },
          { role: "assistant", content: questionsList[nextIdx], questionIndex: nextIdx }
        ]);
      }
      
      toast.success("Question skipped");
    } catch {
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
    } catch {
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

  // Exact progress calculation based on answered questions
  const progress = totalQuestions > 0 ? Math.min(Math.round(((currentQuestionIndex) / totalQuestions) * 100), 100) : 0;

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
                Question {Math.min(currentQuestionIndex + 1, totalQuestions)} of {totalQuestions}
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

            {isGeneratingQuestion && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-2xl rounded-bl-sm px-4 py-3 flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span className="text-sm">Analyzing and generating next question...</span>
                </div>
              </div>
            )}

            <div className="flex justify-end pt-2">
              <div className="w-full max-w-[85%]">
                {!isCompleted ? (
                  <>
                    <Textarea
                      value={currentAnswer}
                      onChange={(e) => setCurrentAnswer(e.target.value)}
                      placeholder="Type your answer here..."
                      rows={4}
                      disabled={isSubmitting || isGeneratingQuestion}
                      className="mb-3"
                    />
                    <div className="flex gap-2 justify-end">
                      <Button
                        variant="outline"
                        onClick={handleSkip}
                        disabled={isSubmitting || isGeneratingQuestion}
                      >
                        Skip
                      </Button>
                      <Button
                        onClick={handleSubmitAnswer}
                        disabled={isSubmitting || isGeneratingQuestion || !currentAnswer.trim()}
                      >
                        <Send className="mr-2 h-4 w-4" />
                        Submit Answer
                      </Button>
                    </div>
                  </>
                ) : (
                  <div className="text-center p-6 bg-muted rounded-xl space-y-4">
                    <h3 className="text-lg font-medium">You have completed all questions!</h3>
                    <Button onClick={handleFinish} disabled={isSubmitting} size="lg" className="w-full">
                      <CheckCircle className="mr-2 h-4 w-4" />
                      Finish & View Report
                    </Button>
                  </div>
                )}
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