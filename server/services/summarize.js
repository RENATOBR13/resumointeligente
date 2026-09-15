import Anthropic from '@anthropic-ai/sdk'
import { GoogleGenerativeAI } from '@google/generative-ai'
import OpenAI from 'openai'

const languageNames = { pt: 'português do Brasil', en: 'inglês', es: 'espanhol' }
const lengthInstructions = {
  curto: 'Seja muito conciso.',
  medio: 'Equilibre clareza e profundidade.',
  detalhado: 'Inclua contexto e relações importantes, sem repetir ideias.'
}
const providers = ['gemini', 'claude', 'openai', 'deepseek']
const providerSet = new Set(providers)

export async function summarizeText({ text, language = 'pt', length = 'medio', provider = 'gemini' }) {
  const selectedProvider = providerSet.has(provider) ? provider : 'gemini'
  const prompt = createPrompt(text, language, length)
  const orderedProviders = [selectedProvider, ...providers.filter((item) => item !== selectedProvider)]
  let lastError = null

  for (const candidate of orderedProviders) {
    try {
      return await runProvider(candidate, prompt)
    } catch (error) {
      lastError = error
      console.warn(`Falha no provedor ${candidate}: ${error.message}`)
    }
  }

  const fallbackMessage = lastError?.message || `Nenhum provedor de IA foi configurado corretamente.`
  throw new Error(`${fallbackMessage} Verifique as chaves e o saldo dos provedores configurados no .env.`)
}

async function runProvider(provider, prompt) {
  if (provider === 'gemini') return summarizeWithGemini(prompt)
  if (provider === 'claude') return summarizeWithClaude(prompt)
  if (provider === 'deepseek') return summarizeWithDeepSeek(prompt)
  return summarizeWithOpenAI(prompt)
}

function createPrompt(text, language, length) {
  return `Você é um editor especialista. Analise o documento e responda somente JSON válido, sem markdown, com exatamente estas chaves: summary (string), points (array) e insights (array).

Idioma: ${languageNames[language] || languageNames.pt}.
${lengthInstructions[length] || lengthInstructions.medio}
summary: escreva um resumo geral claro em 5 a 8 linhas.
points: liste de 5 a 10 pontos importantes, objetivos e sem duplicação.
insights: liste de 3 a 5 ideias-chave ou conceitos centrais.
Seja fiel ao documento e não invente informações.

DOCUMENTO:
${text}`
}

async function summarizeWithGemini(prompt) {
  if (!process.env.GEMINI_API_KEY) throw new Error('Configure GEMINI_API_KEY no arquivo .env.')
  try {
    const client = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim())
    const model = client.getGenerativeModel({ model: process.env.GEMINI_MODEL || 'gemini-3.6-flash', generationConfig: { temperature: 0.35, responseMimeType: 'application/json' } })
    const response = await model.generateContent(prompt)
    return normalizeSummary(JSON.parse(response.response.text()), 'Gemini')
  } catch (error) { throw providerError(error, 'Gemini', 'GEMINI_API_KEY') }
}

async function summarizeWithClaude(prompt) {
  if (!process.env.ANTHROPIC_API_KEY) throw new Error('Configure ANTHROPIC_API_KEY no arquivo .env.')
  try {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY.trim() })
    const response = await client.messages.create({ model: process.env.ANTHROPIC_MODEL || 'claude-3-5-sonnet-latest', max_tokens: 2500, temperature: 0.35, system: 'Responda somente com JSON válido, sem markdown.', messages: [{ role: 'user', content: prompt }] })
    const content = response.content.find((item) => item.type === 'text')?.text
    return normalizeSummary(JSON.parse(content), 'Claude')
  } catch (error) { throw providerError(error, 'Claude', 'ANTHROPIC_API_KEY') }
}

async function summarizeWithOpenAI(prompt) {
  if (!process.env.OPENAI_API_KEY) throw new Error('Configure OPENAI_API_KEY no arquivo .env.')
  try {
    const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY.trim() })
    const response = await client.chat.completions.create({ model: process.env.OPENAI_MODEL || 'gpt-4o-mini', temperature: 0.35, response_format: { type: 'json_object' }, messages: [{ role: 'system', content: 'Responda somente com JSON válido, sem markdown.' }, { role: 'user', content: prompt }], timeout: 45000 })
    return normalizeSummary(JSON.parse(response.choices[0]?.message?.content), 'OpenAI')
  } catch (error) { throw providerError(error, 'OpenAI', 'OPENAI_API_KEY') }
}

async function summarizeWithDeepSeek(prompt) {
  if (!process.env.DEEPSEEK_API_KEY) throw new Error('Configure DEEPSEEK_API_KEY no arquivo .env.')
  try {
    const client = new OpenAI({
      apiKey: process.env.DEEPSEEK_API_KEY.trim(),
      baseURL: 'https://api.deepseek.com',
      defaultHeaders: { 'Content-Type': 'application/json' }
    })

    const response = await client.chat.completions.create({
      model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
      temperature: 0.35,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Responda somente com JSON válido, sem markdown.' },
        { role: 'user', content: prompt }
      ],
      timeout: 45000
    })

    return normalizeSummary(JSON.parse(response.choices[0]?.message?.content), 'DeepSeek')
  } catch (error) { throw providerError(error, 'DeepSeek', 'DEEPSEEK_API_KEY') }
}

function normalizeSummary(summary, providerName) {
  if (!summary || typeof summary.summary !== 'string' || !Array.isArray(summary.points) || !Array.isArray(summary.insights)) throw new Error(`O ${providerName} retornou um formato de resumo inválido.`)
  return { summary: summary.summary.trim(), points: summary.points.filter(Boolean).slice(0, 10), insights: summary.insights.filter(Boolean).slice(0, 5) }
}

function providerError(error, providerName, keyName) {
  const message = error.message || ''
  if (/API key|401|403|authentication|invalid.*key/i.test(message)) return new Error(`A ${keyName} foi recusada. Verifique se a chave está correta e ativa.`)
  if (/404|model.*not found/i.test(message)) return new Error(`O modelo configurado para ${providerName} não está disponível. Verifique a variável de modelo no .env.`)
  if (/429|quota|rate limit|credit/i.test(message)) return new Error(`${providerName} recusou a solicitação por limite de uso ou falta de créditos.`)
  if (/500|503|temporarily unavailable/i.test(message)) return new Error(`A API do ${providerName} está temporariamente indisponível.`)
  return error
}
