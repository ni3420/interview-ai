from unittest.mock import MagicMock, patch

import pytest

from app.services.resume_extraction import (
    ResumeExtractionError,
    extract_text_from_pdf,
)


def _reader_with_pages(texts: list[str]) -> MagicMock:
    reader = MagicMock()
    pages = []
    for text in texts:
        page = MagicMock()
        page.extract_text.return_value = text
        pages.append(page)
    reader.pages = pages
    return reader


@patch("app.services.resume_extraction.PdfReader")
def test_extracts_and_joins_pages(mock_reader):
    mock_reader.return_value = _reader_with_pages(["Page one text", "Page two text"])

    result = extract_text_from_pdf(b"%PDF-1.4 fake")

    assert "Page one text" in result
    assert "Page two text" in result
    assert "\n\n" in result


@patch("app.services.resume_extraction.PdfReader")
def test_raises_when_no_extractable_text(mock_reader):
    mock_reader.return_value = _reader_with_pages(["", "   "])

    with pytest.raises(ResumeExtractionError):
        extract_text_from_pdf(b"%PDF-1.4 fake")


def test_raises_on_empty_bytes():
    with pytest.raises(ResumeExtractionError):
        extract_text_from_pdf(b"")


@patch("app.services.resume_extraction.PdfReader", side_effect=Exception("bad pdf"))
def test_raises_on_unreadable_pdf(_mock_reader):
    with pytest.raises(ResumeExtractionError):
        extract_text_from_pdf(b"not really a pdf")
