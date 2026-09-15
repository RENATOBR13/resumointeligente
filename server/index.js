import dotenv from 'dotenv'
import express from 'express'
import cors from 'cors'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import uploadRouter from './routes/upload.js'

const serverDirectory = path.dirname(fileURLToPath(import.meta.url))
dotenv.config({ path: path.resolve(serverDirectory, '../.env') })

const app = express()
const port = process.env.PORT || 3001

app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:5173' }))
app.use(express.json())
app.get('/api/health', (_request, response) => response.json({ status: 'ok' }))
app.use('/api/upload', uploadRouter)

app.listen(port, () => {
  console.log(`ResumoInteligente API rodando em http://localhost:${port}`)
})
