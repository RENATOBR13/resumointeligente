import { Router } from 'express'
import multer from 'multer'
import path from 'node:path'
import { extractText, splitIntoChunks } from '../services/extractText.js'
import { summarizeText } from '../services/summarize.js'

const router = Router()
const allowedExtensions = new Set(['.pdf', '.docx', '.txt', '.md'])
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase()
    callback(null, allowedExtensions.has(extension))
  }
})

router.post('/', (request, response, next) => {
  upload.single('file')(request, response, (error) => {
    if (error) {
      if (error.code === 'LIMIT_FILE_SIZE') return response.status(413).json({ error: 'O arquivo deve ter no máximo 20 MB.' })
      return response.status(400).json({ error: 'Envie um arquivo PDF, DOCX, TXT ou MD válido.' })
    }
    next()
  })
}, async (request, response) => {
  try {
    if (!request.file) return response.status(400).json({ error: 'Nenhum arquivo foi enviado.' })

    const text = await extractText(request.file)
    if (text.length < 20) return response.status(422).json({ error: 'Não foi possível encontrar texto suficiente no arquivo.' })

    const chunks = splitIntoChunks(text)
    const combinedText = chunks.length > 1 ? chunks.join('\n\n') : text
    const summary = await summarizeText({
      text: combinedText,
      language: request.body.language,
      length: request.body.length,
      provider: request.body.provider
    })

    response.json({
      fileName: request.file.originalname,
      characters: text.length,
      chunks: chunks.length,
      summary
    })
  } catch (error) {
    console.error(error)
    response.status(error.statusCode || 500).json({
      error: error.message || 'Não foi possível processar o documento. Tente novamente.'
    })
  }
})

export default router
