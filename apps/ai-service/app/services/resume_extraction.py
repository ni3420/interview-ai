import io

from pypdf import PdfReader


class ResumeExtractionError(ValueError):
    """Raised when a resume PDF cannot be turned into usable text."""


def extract_text_from_pdf(data: bytes) -> str:
    """Extract normalized plain text from a PDF byte string.

    Raises ResumeExtractionError for empty, unreadable, or text-free documents
    so callers can map the failure to a safe client error.
    """
    if not data:
        raise ResumeExtractionError("Empty PDF document")

    try:
        reader = PdfReader(io.BytesIO(data))
        pages = []
        for page in reader.pages:
            text = (page.extract_text() or "").strip()
            if text:
                pages.append(text)
    except ResumeExtractionError:
        raise
    except Exception as exc:  # pypdf raises several low-level error types
        raise ResumeExtractionError("Could not read the PDF document") from exc

    combined = "\n\n".join(pages).strip()
    if not combined:
        raise ResumeExtractionError("No extractable text found in the PDF")
    return combined
