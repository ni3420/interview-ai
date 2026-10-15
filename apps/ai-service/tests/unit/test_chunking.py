from app.services.chunking import chunk_text


def test_empty_text_returns_no_chunks():
    assert chunk_text("") == []
    assert chunk_text("   \n\t ") == []


def test_short_text_returns_single_chunk():
    assert chunk_text("Experienced backend engineer.") == [
        "Experienced backend engineer."
    ]


def test_long_text_is_split_into_bounded_chunks():
    text = " ".join(f"word{i}" for i in range(3000))
    chunks = chunk_text(text, chunk_size=200, chunk_overlap=50)

    assert len(chunks) > 1
    assert all(len(chunk) <= 200 for chunk in chunks)
    assert all(chunk.strip() for chunk in chunks)
