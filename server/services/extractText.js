import path from 'node:path'
import pdfParse from 'pdf-parse'
import mammoth from 'mammoth'

export async function extractText(file) {
  const extension = path.extname(file.originalname).toLowerCase()
  let text

  if (extension === '.pdf') {
    const result = await pdfParse(file.buffer)
    text = result.text
  } else if (extension === '.docx') {
    const result = await mammoth.extractRawText({ buffer: file.buffer })
    text = result.value
  } else if (extension === '.txt' || extension === '.md') {
    text = file.buffer.toString('utf8')
  } else {
    throw new Error('Formato de arquivo não suportado.')
  }

  return normalizeText(text)
}

function normalizeText(text) {
  return text
    .replace(/\r\n/g, '\n')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function splitIntoChunks(text, maxCharacters = 12000) {
  const paragraphs = text.split(/\n\s*\n/).filter(Boolean)
  const chunks = []
  let current = ''

  for (const paragraph of paragraphs) {
    if (current && current.length + paragraph.length + 2 > maxCharacters) {
      chunks.push(current)
      current = ''
    }
    current += `${current ? '\n\n' : ''}${paragraph}`
  }

  if (current) chunks.push(current)
  return chunks.length ? chunks : [text]
}
