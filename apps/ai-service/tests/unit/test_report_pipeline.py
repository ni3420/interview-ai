from app.schemas.report import QAPairInput, ReportRequest, SegmentInput
from app.services.report_pipeline import (
    analyze_request,
    classify_segment,
    compute_counts,
    has_back_reference,
    looks_like_question,
    PlannedQuestion,
)


def segment(
    segment_id: str,
    speaker: str,
    start: float,
    text: str,
    *,
    end: float | None = None,
    asr_confidence: float | None = None,
    speaker_confidence: float = 1.0,
) -> SegmentInput:
    return SegmentInput(
        id=segment_id,
        speaker=speaker,
        start=start,
        end=start + 1 if end is None else end,
        text=text,
        asr_confidence=asr_confidence,
        speaker_confidence=speaker_confidence,
    )


def request_with(segments: list[SegmentInput], **kwargs) -> ReportRequest:
    return ReportRequest(
        interview_id="interview-1",
        job_description="Backend engineer",
        resume_text="Test resume",
        segments=segments,
        **kwargs,
    )


class TestClassification:
    def test_greetings_small_talk_fillers_and_noise_are_not_answer_content(self):
        assert classify_segment("Hello", "candidate") == "greeting"
        assert classify_segment("Thanks for your time", "candidate") == "small_talk"
        assert classify_segment("um", "candidate") == "filler_only"
        assert classify_segment("[music]", "candidate") == "noise"
        assert classify_segment("", "candidate") == "noise"

    def test_unknown_speaker_is_background_even_with_real_words(self):
        assert classify_segment("I deployed the service last week", "unknown") == "background"

    def test_low_confidence_or_garbled_speech_is_unverified(self):
        assert classify_segment("Something happened", "candidate", 0.2) == "unverified"
        assert classify_segment("sooooooo much data", "candidate") == "unverified"
        assert classify_segment("what???", "candidate") == "unverified"

    def test_real_answer_text_is_answer_content(self):
        assert (
            classify_segment("Indexes reduce table scans.", "candidate")
            == "answer_content"
        )


class TestQuestionExtraction:
    def test_merged_interviewer_captions_become_one_question(self):
        result = analyze_request(
            request_with(
                [
                    segment("i1", "interviewer", 0, "Tell me about"),
                    segment("i2", "interviewer", 1.5, "your React experience."),
                    segment("c1", "candidate", 3, "I built dashboards with React."),
                ]
            )
        )

        assert len(result.questions) == 1
        assert result.questions[0].question == "Tell me about your React experience."
        assert result.questions[0].status == "answered"
        assert result.questions[0].evidence == ["I built dashboards with React."]

    def test_distant_interviewer_turns_stay_separate(self):
        result = analyze_request(
            request_with(
                [
                    segment("i1", "interviewer", 0, "Tell me about React.", end=1),
                    segment("c1", "candidate", 2, "I built dashboards."),
                    segment("i2", "interviewer", 5, "How do you test components?", end=6),
                    segment("c2", "candidate", 7, "With unit tests."),
                ]
            )
        )

        assert [q.question for q in result.questions] == [
            "Tell me about React.",
            "How do you test components?",
        ]

    def test_non_question_interviewer_turns_are_ignored(self):
        result = analyze_request(
            request_with(
                [
                    segment("i1", "interviewer", 0, "Great."),
                    segment("i2", "interviewer", 2, "Explain closures."),
                    segment("c1", "candidate", 3, "A closure captures its scope."),
                ]
            )
        )

        assert [q.question for q in result.questions] == ["Explain closures."]

    def test_question_and_back_reference_helpers(self):
        assert looks_like_question("What is a race condition?") is True
        assert looks_like_question("That sounds good.") is False
        assert has_back_reference("As I mentioned earlier, indexes help.") is True


class TestTranscriptMatching:
    def test_answers_attach_to_one_question_by_time_window(self):
        result = analyze_request(
            request_with(
                [
                    segment("i1", "interviewer", 0, "Tell me about databases."),
                    segment("c1", "candidate", 2, "I used PostgreSQL for billing."),
                    segment("i2", "interviewer", 5, "How did you tune queries?"),
                    segment("c2", "candidate", 7, "I added indexes and read plans."),
                ]
            )
        )

        assert [q.answer for q in result.questions] == [
            "I used PostgreSQL for billing.",
            "I added indexes and read plans.",
        ]
        assert all(q.status == "answered" for q in result.questions)
        assert result.excluded_segments == 0
        assert compute_counts(result.questions, result.excluded_segments).evaluated == 2

    def test_sorted_segments_produce_consistent_windows(self):
        result = analyze_request(
            request_with(
                [
                    segment("c2", "candidate", 9, "Each index adds write overhead."),
                    segment("i1", "interviewer", 1, "Explain database indexes.", end=3),
                    segment("c3", "candidate", 12, "I remove unused ones."),
                    segment("i2", "interviewer", 8, "Why can too many indexes hurt writes?", end=8.5),
                    segment("c1", "candidate", 2, "Indexes are lookup structures."),
                    segment("c0", "candidate", 0, "I am ready to begin"),
                ]
            )
        )

        assert [q.question for q in result.questions] == [
            "Explain database indexes.",
            "Why can too many indexes hurt writes?",
        ]
        assert result.questions[0].answer == "Indexes are lookup structures."
        assert result.questions[1].answer == (
            "Each index adds write overhead. I remove unused ones."
        )
        # Candidate speech before the first question is not evidence.
        assert result.excluded_segments == 1

    def test_greetings_and_small_talk_in_the_answer_window_are_excluded(self):
        result = analyze_request(
            request_with(
                [
                    segment("i0", "interviewer", 0, "Hello"),
                    segment("i1", "interviewer", 2, "Explain how indexes work."),
                    segment("c0", "candidate", 0.5, "Hi"),
                    segment("c1", "candidate", 4, "An index is a lookup structure."),
                    segment("c2", "candidate", 8, "Thanks."),
                ]
            )
        )

        assert len(result.questions) == 1
        assert result.questions[0].answer == "An index is a lookup structure."
        assert result.questions[0].status == "answered"
        assert result.excluded_segments == 2

    def test_fillers_alone_do_not_become_an_answer(self):
        result = analyze_request(
            request_with(
                [
                    segment("i1", "interviewer", 0, "What is a closure?"),
                    segment("c1", "candidate", 3, "um"),
                ]
            )
        )

        question = result.questions[0]
        assert question.status == "unanswered"
        assert question.answer == ""
        assert question.evaluable is False
        assert question.reason == "The candidate did not provide a verifiable answer."

    def test_unknown_speaker_in_the_window_is_not_evaluable(self):
        result = analyze_request(
            request_with(
                [
                    segment("i1", "interviewer", 0, "Describe event loops."),
                    segment("u1", "unknown", 3, "Background conversation."),
                ]
            )
        )

        question = result.questions[0]
        assert question.status == "not_evaluable"
        assert question.answer == ""
        assert question.evaluable is False
        assert "could not be attributed" in (question.reason or "")
        assert result.excluded_segments == 1
        codes = [code for code, _ in result.warnings]
        assert "background_speaker_excluded" in codes

    def test_low_speaker_confidence_is_not_evaluable(self):
        result = analyze_request(
            request_with(
                [
                    segment("i1", "interviewer", 0, "What is a race condition?"),
                    segment(
                        "c1",
                        "candidate",
                        3,
                        "It happens when threads share state.",
                        speaker_confidence=0.2,
                    ),
                ]
            )
        )

        question = result.questions[0]
        assert question.status == "not_evaluable"
        assert question.answer == ""
        assert result.excluded_segments == 1

    def test_low_asr_confidence_warns_and_is_not_evidence(self):
        result = analyze_request(
            request_with(
                [
                    segment("i1", "interviewer", 0, "Explain transactions."),
                    segment(
                        "c1",
                        "candidate",
                        3,
                        "A transaction is atomic.",
                        asr_confidence=0.3,
                    ),
                ]
            )
        )

        question = result.questions[0]
        assert question.status == "not_evaluable"
        codes = [code for code, _ in result.warnings]
        assert "unverified_transcript" in codes
        assert "low_asr_confidence" in codes

    def test_explicit_back_reference_links_an_answer_to_the_previous_question(self):
        result = analyze_request(
            request_with(
                [
                    segment("i1", "interviewer", 0, "Explain database indexes.", end=2),
                    segment("c1", "candidate", 2.5, "Indexes are lookup structures."),
                    segment("i2", "interviewer", 6, "How do you choose an index?", end=7),
                    segment(
                        "c2",
                        "candidate",
                        8,
                        "As I mentioned earlier, indexes speed lookups, and I check selectivity.",
                    ),
                ]
            )
        )

        first, second = result.questions
        assert first.answer == (
            "Indexes are lookup structures. As I mentioned earlier, indexes speed "
            "lookups, and I check selectivity."
        )
        assert len(first.link_reasons) == 1
        assert "explicitly referenced the previous question" in first.link_reasons[0]
        assert second.answer.startswith("As I mentioned earlier")
        assert second.link_reasons == []
        # The segment is deliberately allowed to support both questions.
        assert result.excluded_segments == 0


class TestLegacyAnswers:
    def test_legacy_rows_keep_statuses_without_assuming_answers(self):
        result = analyze_request(
            ReportRequest(
                interview_id="interview-1",
                job_description="Backend engineer",
                qa_pairs=[
                    QAPairInput(question_index=0, question="Q0", answer=""),
                    QAPairInput(question_index=1, question="Q1", answer="Hello"),
                    QAPairInput(
                        question_index=2,
                        question="Q2",
                        answer="sooooooo much data",
                    ),
                    QAPairInput(
                        question_index=3,
                        question="Q3",
                        answer="Indexes speed lookups.",
                    ),
                ],
            )
        )

        assert [q.status for q in result.questions] == [
            "unanswered",
            "unanswered",
            "not_evaluable",
            "answered",
        ]
        assert result.questions[3].evidence == ["Indexes speed lookups."]
        assert [code for code, _ in result.warnings] == ["legacy_transcript_fallback"]

    def test_counts_include_partial_and_only_evaluable_questions(self):
        questions = [
            PlannedQuestion(0, "Q0", "A0", "answered", True),
            PlannedQuestion(1, "Q1", "partial", "partial", True),
            PlannedQuestion(2, "Q2", "", "unanswered", False),
            PlannedQuestion(3, "Q3", "", "not_evaluable", False),
        ]

        counts = compute_counts(questions, excluded_segments=4)

        assert counts.questions == 4
        assert counts.answered == 1
        assert counts.partial == 1
        assert counts.unanswered == 1
        assert counts.not_evaluable == 1
        assert counts.evaluated == 2
        assert counts.excluded_segments == 4
