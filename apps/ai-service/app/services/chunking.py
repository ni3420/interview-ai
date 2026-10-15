from langchain_text_splitters import RecursiveCharacterTextSplitter

from app.core.config import settings


def chunk_text(
    text: str,
    *,
    chunk_size: int | None = None,
    chunk_overlap: int | None = None,
) -> list[str]:
    """Split resume text into overlapping chunks suitable for embedding.

    Empty and whitespace-only chunks are dropped so Qdrant never receives
    meaningless vectors.
    """
    splitter = RecursiveCharacterTextSplitter(
        chunk_size=chunk_size or settings.chunk_size,
        chunk_overlap=(
            chunk_overlap if chunk_overlap is not None else settings.chunk_overlap
        ),
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    return [chunk for chunk in (c.strip() for c in splitter.split_text(text)) if chunk]
