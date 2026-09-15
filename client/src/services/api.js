export async function summarizeFile(file, options, onProgress) {
  const formData = new FormData()
  formData.append('file', file)
  formData.append('language', options.language)
  formData.append('length', options.length)
  formData.append('provider', options.provider)

  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest()
    request.open('POST', '/api/upload')
    request.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(Math.round((event.loaded / event.total) * 100))
    }
    request.onload = () => {
      let body
      try { body = JSON.parse(request.responseText) } catch { body = {} }
      if (request.status >= 200 && request.status < 300) resolve(body)
      else reject(new Error(body.error || 'Não foi possível gerar o resumo.'))
    }
    request.onerror = () => reject(new Error('A API está indisponível.'))
    request.ontimeout = () => reject(new Error('O processamento demorou demais.'))
    request.timeout = 60000
    request.send(formData)
  })
}
