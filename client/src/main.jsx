import React, { useEffect, useRef, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { ArrowRight, ArrowUpRight, Check, Clock3, Copy, FileText, KeyRound, Moon, RefreshCw, Sparkles, Sun, UploadCloud, X } from 'lucide-react'
import { jsPDF } from 'jspdf'
import { supabase } from './lib/supabase.js'
import { summarizeFile } from './services/api.js'
import './styles.css'

const supportedExtensions = ['.pdf', '.docx', '.txt', '.md']
const emptySummary = { summary: '', points: [], insights: [] }

function App() {
  const [session, setSession] = useState(() => JSON.parse(localStorage.getItem('resumo-session') || 'null'))
  const [file, setFile] = useState(null)
  const [options, setOptions] = useState({ provider: 'gemini', language: 'pt', length: 'medio' })
  const [result, setResult] = useState(null)
  const [progress, setProgress] = useState(0)
  const [status, setStatus] = useState('idle')
  const [error, setError] = useState('')
  const [isDragging, setIsDragging] = useState(false)
  const [darkMode, setDarkMode] = useState(() => localStorage.getItem('resumo-theme') === 'dark')
  const [history, setHistory] = useState(() => JSON.parse(localStorage.getItem('resumo-history') || '[]'))
  const inputRef = useRef(null)

  useEffect(() => {
    document.documentElement.dataset.theme = darkMode ? 'dark' : 'light'
    localStorage.setItem('resumo-theme', darkMode ? 'dark' : 'light')
  }, [darkMode])

  useEffect(() => {
    const restoreSession = async () => {
      const { data: { session: activeSession } } = await supabase.auth.getSession()
      if (activeSession?.user) {
        const nextSession = { email: activeSession.user.email, signedInAt: new Date().toISOString() }
        localStorage.setItem('resumo-session', JSON.stringify(nextSession))
        setSession(nextSession)
      }
    }

    restoreSession()

    const { data: authListener } = supabase.auth.onAuthStateChange((_event, activeSession) => {
      if (activeSession?.user) {
        const nextSession = { email: activeSession.user.email, signedInAt: new Date().toISOString() }
        localStorage.setItem('resumo-session', JSON.stringify(nextSession))
        setSession(nextSession)
      } else {
        localStorage.removeItem('resumo-session')
        setSession(null)
      }
    })

    return () => authListener.subscription.unsubscribe()
  }, [])

  async function handleSignIn(email, password) {
    const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password })

    if (signInError) {
      throw signInError
    }

    if (data?.user) {
      const nextSession = { email: data.user.email, signedInAt: new Date().toISOString() }
      localStorage.setItem('resumo-session', JSON.stringify(nextSession))
      setSession(nextSession)
    }
  }

  async function handleSignUp(email, password) {
    const { data, error: signUpError } = await supabase.auth.signUp({ email, password })

    if (signUpError) {
      throw signUpError
    }

    if (data?.user) {
      const nextSession = { email: data.user.email, signedInAt: new Date().toISOString() }
      localStorage.setItem('resumo-session', JSON.stringify(nextSession))
      setSession(nextSession)
    }

    return data
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    localStorage.removeItem('resumo-session')
    setSession(null)
    setFile(null)
    setResult(null)
  }

  function selectFile(nextFile) {
    setError('')
    if (!nextFile) return
    const extension = `.${nextFile.name.split('.').pop().toLowerCase()}`
    if (!supportedExtensions.includes(extension)) return setError('Formato não suportado. Use PDF, DOCX, TXT ou MD.')
    if (nextFile.size > 20 * 1024 * 1024) return setError('O arquivo deve ter no máximo 20 MB.')
    setFile(nextFile)
    setResult(null)
    setStatus('idle')
  }

  async function handleSubmit(event) {
    event.preventDefault()
    if (!file) return setError('Selecione um arquivo para começar.')
    setError('')
    setStatus('uploading')
    setProgress(0)
    try {
      const data = await summarizeFile(file, options, setProgress)
      setResult(data)
      setStatus('done')
      const entry = { ...data, id: Date.now(), createdAt: new Date().toISOString() }
      const nextHistory = [entry, ...history.filter((item) => item.fileName !== data.fileName)].slice(0, 8)
      setHistory(nextHistory)
      localStorage.setItem('resumo-history', JSON.stringify(nextHistory))
    } catch (requestError) {
      setStatus('error')
      setError(requestError.message)
    }
  }

  function loadHistory(entry) {
    setResult(entry)
    setFile({ name: entry.fileName })
    setStatus('done')
  }

  function exportSummary(format) {
    if (!result) return
    const baseName = `resumo-${result.fileName.replace(/\.[^.]+$/, '')}`
    if (format === 'pdf') {
      const document = new jsPDF()
      const margin = 18
      const lineWidth = 174
      let cursorY = 22

      document.setFont('helvetica', 'bold')
      document.setFontSize(18)
      document.text('ResumoInteligente', margin, cursorY)
      cursorY += 10
      document.setFont('helvetica', 'normal')
      document.setFontSize(10)
      document.setTextColor(105, 116, 110)
      document.text(result.fileName, margin, cursorY)
      cursorY += 14
      document.setTextColor(23, 36, 32)

      cursorY = addPdfSection(document, 'Resumo geral', result.summary.summary, cursorY, margin, lineWidth)
      cursorY = addPdfList(document, 'Pontos importantes', result.summary.points, cursorY, margin, lineWidth)
      addPdfList(document, 'Ideias-chave / insights', result.summary.insights, cursorY, margin, lineWidth)
      document.save(`${baseName}.pdf`)
      return
    }
    const content = format === 'md'
      ? `# ${result.fileName}\n\n## Resumo geral\n${result.summary.summary}\n\n## Pontos importantes\n${result.summary.points.map((point) => `- ${point}`).join('\n')}\n\n## Ideias-chave\n${result.summary.insights.map((insight) => `- ${insight}`).join('\n')}`
      : `${result.fileName}\n\nRESUMO GERAL\n${result.summary.summary}\n\nPONTOS IMPORTANTES\n${result.summary.points.map((point) => `• ${point}`).join('\n')}\n\nIDEIAS-CHAVE\n${result.summary.insights.map((insight) => `• ${insight}`).join('\n')}`
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' })
    const link = document.createElement('a')
    link.href = URL.createObjectURL(blob)
    link.download = `${baseName}.${format}`
    link.click()
    URL.revokeObjectURL(link.href)
  }

  async function copySummary() {
    if (!result) return
    await navigator.clipboard.writeText(`${result.summary.summary}\n\n${result.summary.points.join('\n')}`)
    setStatus('copied')
    setTimeout(() => setStatus('done'), 1800)
  }

  if (!session) return <AuthScreen darkMode={darkMode} setDarkMode={setDarkMode} onSignIn={handleSignIn} onSignUp={handleSignUp} />

  return (
    <div className="app-shell">
      <header className="topbar">
        <a className="brand" href="/" aria-label="ResumoInteligente início"><span className="brand-mark"><Sparkles size={17} /></span><span>Resumo<span className="brand-accent">Inteligente</span></span></a>
        <div className="top-actions"><span className="status-label"><span className="status-dot" /> IA pronta</span><span className="user-email">{session.email}</span><button className="sign-out-button" onClick={handleSignOut}>Sair</button><button className="icon-button" onClick={() => setDarkMode(!darkMode)} aria-label="Alternar tema">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button></div>
      </header>

      <main className="main-content">
        <section className="intro"><div><p className="eyebrow"><span /> LEIA MENOS. ENTENDA MAIS.</p><h1>Seu próximo<br /><em>insight</em> começa aqui.</h1><p className="intro-copy">Transforme documentos extensos em clareza. Faça upload e receba uma síntese inteligente em segundos.</p></div><div className="intro-decoration" aria-hidden="true"><span>01</span><span>02</span><span>03</span></div></section>

        <div className="workspace-grid">
          <section className="panel upload-panel">
            <div className="panel-heading"><div><p className="section-kicker">01 / DOCUMENTO</p><h2>O que vamos ler?</h2></div><span className="format-note">PDF · DOCX · TXT · MD</span></div>
            <div className={`drop-zone ${isDragging ? 'is-dragging' : ''} ${file ? 'has-file' : ''}`} onDragOver={(event) => { event.preventDefault(); setIsDragging(true) }} onDragLeave={() => setIsDragging(false)} onDrop={(event) => { event.preventDefault(); setIsDragging(false); selectFile(event.dataTransfer.files[0]) }} onClick={() => inputRef.current?.click()}>
              <input ref={inputRef} type="file" accept=".pdf,.docx,.txt,.md" onChange={(event) => selectFile(event.target.files[0])} hidden />
              {file ? <><div className="file-icon"><FileText size={23} /></div><div className="file-copy"><strong>{file.name}</strong><span>{file.size ? `${(file.size / 1024 / 1024).toFixed(2)} MB · pronto para resumir` : 'Resumo do histórico'}</span></div><button className="remove-file" onClick={(event) => { event.stopPropagation(); setFile(null); setResult(null) }} aria-label="Remover arquivo"><X size={17} /></button></> : <><div className="upload-icon"><UploadCloud size={25} /></div><div><strong>Solte seu arquivo aqui</strong><span>ou clique para selecionar do computador</span></div></>}
            </div>
            {error && <div className="error-message">{error}</div>}
            {status === 'uploading' && <div className="progress-wrap"><div className="progress-meta"><span>{progress < 100 ? 'Enviando documento...' : 'Gerando seu resumo...'}</span><span>{progress}%</span></div><div className="progress-track"><div className="progress-value" style={{ width: `${Math.max(progress, 4)}%` }} /></div></div>}
            <div className="settings-block"><div className="setting-label">MOTOR DE IA</div><div className="segmented-control provider-control">{[['gemini', 'Gemini'], ['claude', 'Claude'], ['openai', 'OpenAI'], ['deepseek', 'DeepSeek']].map(([value, label]) => <button key={value} className={options.provider === value ? 'active' : ''} onClick={() => setOptions({ ...options, provider: value })}>{label}</button>)}</div><div className="setting-label length-label">IDIOMA DO RESUMO</div><div className="segmented-control">{[['pt', 'PT-BR'], ['en', 'EN'], ['es', 'ES']].map(([value, label]) => <button key={value} className={options.language === value ? 'active' : ''} onClick={() => setOptions({ ...options, language: value })}>{label}</button>)}</div><div className="setting-label length-label">NÍVEL DE DETALHE</div><div className="length-options">{[['curto', 'Curto', 'essencial'], ['medio', 'Médio', 'equilibrado'], ['detalhado', 'Detalhado', 'profundo']].map(([value, label, detail]) => <button key={value} className={options.length === value ? 'active' : ''} onClick={() => setOptions({ ...options, length: value })}><span>{label}</span><small>{detail}</small></button>)}</div></div>
            <button className="primary-button" onClick={handleSubmit} disabled={status === 'uploading'}><span>{status === 'uploading' ? 'Processando documento' : 'Gerar resumo'}</span>{status === 'uploading' ? <RefreshCw className="spin" size={18} /> : <ArrowUpRight size={18} />}</button>
            <p className="privacy-note">Seus documentos são processados com segurança e não ficam armazenados no servidor.</p>
          </section>

          <section className="panel result-panel"><div className="panel-heading result-heading"><div><p className="section-kicker">02 / SÍNTESE</p><h2>O essencial, claro.</h2></div>{result && <div className="result-actions"><button onClick={copySummary} title="Copiar resumo">{status === 'copied' ? <Check size={16} /> : <Copy size={16} />}<span>{status === 'copied' ? 'Copiado' : 'Copiar'}</span></button><button onClick={() => exportSummary('txt')} title="Baixar TXT">TXT</button><button onClick={() => exportSummary('md')} title="Baixar Markdown">MD</button><button onClick={() => exportSummary('pdf')} title="Baixar PDF">PDF</button></div>}</div>{result ? <SummaryContent summary={result.summary} /> : <div className="empty-result"><div className="empty-orbit"><Sparkles size={25} /></div><h3>Ainda não há nada por aqui.</h3><p>Seu resumo aparecerá neste espaço assim que você enviar um documento.</p><div className="empty-line" /></div>}</section>
        </div>

        {history.length > 0 && <section className="history-section"><div className="history-header"><div><p className="section-kicker">03 / ARQUIVO</p><h2>Resumos recentes</h2></div><span>{history.length} {history.length === 1 ? 'documento' : 'documentos'}</span></div><div className="history-list">{history.map((entry) => <button className="history-item" key={entry.id} onClick={() => loadHistory(entry)}><span className="history-file-icon"><FileText size={17} /></span><span className="history-file"><strong>{entry.fileName}</strong><small>{new Date(entry.createdAt).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })} · {entry.characters?.toLocaleString('pt-BR')} caracteres</small></span><Clock3 size={16} /></button>)}</div></section>}
      </main>
      <footer><span>RESUMOINTELIGENTE <b>© 2026</b></span><span>FEITO PARA IDEIAS QUE IMPORTAM</span></footer>
    </div>
  )
}

function AuthScreen({ darkMode, setDarkMode, onSignIn, onSignUp }) {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [mode, setMode] = useState('login')
  const [error, setError] = useState('')
  const [message, setMessage] = useState('')

  function formatAuthError(authError) {
    const rawMessage = authError?.message || ''
    const status = authError?.status
    const normalizedMessage = rawMessage.toLowerCase()

    if (status === 429 || normalizedMessage.includes('rate limit') || normalizedMessage.includes('email rate limit')) {
      return 'Muitas tentativas de cadastro por e-mail. Aguarde alguns minutos e tente novamente.'
    }

    return authError?.message || 'Não foi possível continuar. Verifique as credenciais do Supabase.'
  }

  async function submit(event) {
    event.preventDefault()
    if (!email.trim() || !email.includes('@')) return setError('Digite um e-mail válido.')
    if (password.length < 6) return setError('A senha precisa ter pelo menos 6 caracteres.')

    try {
      setError('')
      setMessage('')

      if (mode === 'register') {
        const data = await onSignUp(email.trim().toLowerCase(), password)

        if (data?.user && data.user.email_confirmed_at) {
          setMessage('Conta criada com sucesso! Você já pode usar o app.')
        } else {
          setMessage('Cadastro realizado. Verifique seu e-mail para confirmar a conta antes de entrar.')
        }
        return
      }

      await onSignIn(email.trim().toLowerCase(), password)
    } catch (signInError) {
      setError(formatAuthError(signInError))
    }
  }

  return <div className="auth-shell"><header className="topbar"><a className="brand" href="/" aria-label="ResumoInteligente início"><span className="brand-mark"><Sparkles size={17} /></span><span>Resumo<span className="brand-accent">Inteligente</span></span></a><button className="icon-button" onClick={() => setDarkMode(!darkMode)} aria-label="Alternar tema">{darkMode ? <Sun size={18} /> : <Moon size={18} />}</button></header><main className="auth-layout"><div className="auth-story"><p className="eyebrow"><span /> UM NOVO JEITO DE LER</p><h1>Clareza para<br /><em>suas ideias.</em></h1><p>Entre para transformar documentos longos em decisões mais simples, com a inteligência artificial que você escolher.</p><div className="auth-stamp"><KeyRound size={16} /><span>SEU ESPAÇO DE SÍNTESE</span></div></div><form className="auth-card" onSubmit={submit}><div className="auth-card-heading"><div className="auth-card-icon"><KeyRound size={21} /></div><div><p className="section-kicker">ACESSO SEGURO</p><h2>{mode === 'login' ? 'Bem-vindo de volta.' : 'Crie sua conta.'}</h2></div></div><label htmlFor="auth-email">E-mail<input id="auth-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="voce@exemplo.com" autoComplete="email" /></label><label htmlFor="auth-password">Senha<input id="auth-password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Mínimo de 6 caracteres" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></label>{error && <p className="auth-error">{error}</p>}{message && <p className="auth-success">{message}</p>}<button className="primary-button auth-submit" type="submit"><span>{mode === 'login' ? 'Entrar no meu espaço' : 'Criar conta'}</span><ArrowRight size={18} /></button><p className="auth-toggle"><button type="button" className="link-button" onClick={() => { setMode(mode === 'login' ? 'register' : 'login'); setError(''); setMessage('') }}>{mode === 'login' ? 'Criar conta' : 'Já tenho uma conta'}</button></p><p className="auth-disclaimer">Autenticação segura com Supabase. A senha fica protegida pelo painel do projeto.</p></form></main><footer><span>RESUMOINTELIGENTE <b>© 2026</b></span><span>FEITO PARA IDEIAS QUE IMPORTAM</span></footer></div>
}

function SummaryContent({ summary }) {
  return <div className="summary-content"><div className="summary-lead"><span className="quote-mark">“</span><p>{summary.summary}</p></div><div className="summary-sections"><div className="summary-section"><div className="summary-title"><span className="number-badge">01</span><h3>Pontos importantes</h3></div><ul>{summary.points.map((point, index) => <li key={index}><span>{String(index + 1).padStart(2, '0')}</span>{point}</li>)}</ul></div><div className="summary-section insights-section"><div className="summary-title"><span className="number-badge dark">02</span><h3>Ideias-chave / insights</h3></div><ul>{summary.insights.map((insight, index) => <li key={index}><span className="insight-dot" />{insight}</li>)}</ul></div></div></div>
}

function addPdfSection(document, title, text, cursorY, margin, lineWidth) {
  document.setFont('helvetica', 'bold')
  document.setFontSize(13)
  document.text(title, margin, cursorY)
  cursorY += 8
  document.setFont('helvetica', 'normal')
  document.setFontSize(10)
  const lines = document.splitTextToSize(text, lineWidth)
  document.text(lines, margin, cursorY)
  return cursorY + lines.length * 5 + 10
}

function addPdfList(document, title, items, cursorY, margin, lineWidth) {
  if (cursorY > 255) {
    document.addPage()
    cursorY = 22
  }
  document.setFont('helvetica', 'bold')
  document.setFontSize(13)
  document.text(title, margin, cursorY)
  cursorY += 8
  document.setFont('helvetica', 'normal')
  document.setFontSize(10)
  items.forEach((item, index) => {
    const lines = document.splitTextToSize(`${index + 1}. ${item}`, lineWidth)
    if (cursorY + lines.length * 5 > 280) {
      document.addPage()
      cursorY = 22
    }
    document.text(lines, margin, cursorY)
    cursorY += lines.length * 5 + 3
  })
  return cursorY + 7
}

createRoot(document.getElementById('root')).render(<App />)
