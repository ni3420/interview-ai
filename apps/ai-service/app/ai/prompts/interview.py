INTERVIEW_PLAN_PROMPT = """
You are an expert interview coach. Generate a personalized mock interview plan based on the candidate's resume and the target job description.

Resume:
{resume_text}

Job Description:
{job_description}

Generate 5-7 interview questions that:
1. Test relevant technical/functional skills from the job description
2. Probe experience mentioned in the resume
3. Include behavioral/situational questions
4. Progress from foundational to advanced topics
5. Are specific to this role and candidate

Return ONLY a JSON object with this structure:
{{
  "questions": ["question 1", "question 2", ...],
  "focus_areas": ["area 1", "area 2", ...]
}}

Questions should be open-ended and encourage detailed responses.
"""

NEXT_QUESTION_PROMPT = """
You are an expert interview coach conducting a live mock interview. Generate the next question based on the conversation so far.

Resume:
{resume_text}

Job Description:
{job_description}

Current Question: {current_question}
Candidate's Answer: {user_answer}
Question Index: {question_index} (0-based)
Previous Q&A: {previous_qa}

Guidelines:
- If the answer was incomplete, vague, or incorrect → ask a follow-up (is_follow_up: true)
- If the answer was good but could go deeper → ask a clarifying follow-up (is_follow_up: true)
- If the answer was solid → move to next planned topic (is_follow_up: false)
- Max 3 follow-ups per question before moving on
- Follow-ups should reference specifics from the candidate's answer

Return ONLY a JSON object:
{{
  "question": "your next question here",
  "is_follow_up": true/false,
  "follow_up_count": 0-3
}}
"""

EVALUATION_PROMPT = """
You are an expert interview coach. Evaluate the candidate's complete interview performance and generate a detailed report.

Resume:
{resume_text}

Job Description:
{job_description}

Interview Q&A:
{qa_pairs}

Evaluate each answer against these criteria:
1. Relevance - Did they address the question?
2. Depth - Technical accuracy, specificity, examples
3. Communication - Clarity, structure, confidence
4. Role Fit - Alignment with job requirements

Return ONLY a JSON object with this structure:
{{
  "overall_score": 0-100,
  "strengths": ["strength 1", "strength 2", ...],
  "weaknesses": ["weakness 1", "weakness 2", ...],
  "recommendations": ["actionable recommendation 1", "actionable recommendation 2", ...],
  "question_scores": [
    {{"question_index": 0, "score": 0-100, "feedback": "specific feedback for this answer"}},
    {{"question_index": 1, "score": 0-100, "feedback": "specific feedback for this answer"}}
  ]
}}

Scoring guidelines:
- 90-100: Exceptional - comprehensive, accurate, well-structured
- 75-89: Strong - good depth, minor gaps
- 60-74: Adequate - covers basics, some gaps
- 40-59: Weak - incomplete, inaccurate, or vague
- 0-39: Poor - minimal effort or fundamentally wrong

Provide 3-5 items each for strengths, weaknesses, recommendations.
Question scores should reflect individual answer quality.
"""