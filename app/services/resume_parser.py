from io import BytesIO

from fastapi import HTTPException, UploadFile


def extract_text_from_pdf_bytes(contents: bytes) -> str:
    try:
        from pypdf import PdfReader

        pdf_reader = PdfReader(BytesIO(contents))

        text_parts = []

        for page in pdf_reader.pages:
            page_text = page.extract_text()
            if page_text:
                text_parts.append(page_text)

        text = "\n".join(text_parts).strip()

        if not text:
            raise HTTPException(
                status_code=400,
                detail="Could not extract text from this PDF"
            )

        return text

    except HTTPException:
        raise

    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Failed to process PDF"
        ) from e


async def extract_text_from_pdf(file: UploadFile) -> str:
    contents = await file.read()
    return extract_text_from_pdf_bytes(contents)
