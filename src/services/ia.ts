import { GoogleGenAI } from '@google/genai'

// Se não houver chave configurada, o serviço fica desabilitado e o
// enriquecimento por IA é simplesmente pulado (ver pecas.ts).
const apiKey = process.env.GEMINI_API_KEY
const ai = apiKey ? new GoogleGenAI({ apiKey }) : null
if (!ai) console.warn('[ia] GEMINI_API_KEY não configurada: o cadastro funciona, mas sem dados de IA')

// O Google limita o gemini-2.5-flash a quem já o usava; chaves novas costumam precisar dos modelos
// atuais. Tenta nesta ordem até um responder. Dá para fixar um modelo com GEMINI_MODEL.
const MODELOS = [
  process.env.GEMINI_MODEL,
  'gemini-3.5-flash-lite',
  'gemini-3.8-flash',
  'gemini-2.5-flash',
].filter((m, i, lista): m is string => Boolean(m) && lista.indexOf(m) === i)

const schemaPeca = {
  type: 'OBJECT',
  properties: {
    materialProvavel: {
      type: 'STRING',
      description:
        'Composição/material provável do tecido da peça, em poucas palavras (ex.: "Algodão com elastano").',
    },
    dicasCuidado: {
      type: 'STRING',
      description:
        'Dicas curtas de lavagem e conservação da peça, em 2 a 3 frases.',
    },
    epocaEstimada: {
      type: 'STRING',
      description:
        'Década ou estilo estimado da peça, com base na descrição (ex.: "Anos 90", "Y2K").',
    },
  },
  required: ['materialProvavel', 'dicasCuidado', 'epocaEstimada'],
}

export type DadosIA = {
  materialProvavel: string
  dicasCuidado: string
  epocaEstimada: string
}

export async function buscarDadosComGemini(
  categoria: string,
  marca: string | null | undefined,
  descricao: string,
): Promise<DadosIA | null> {
  if (!ai) return null

  const contents =
    `Você é um assistente de um brechó (loja de roupas usadas). ` +
    `Analise esta peça: categoria "${categoria}"${marca ? `, marca "${marca}"` : ''}, ` +
    `descrição: "${descricao}". ` +
    `Com base nisso, sugira (mesmo que de forma estimada) o material provável do tecido, ` +
    `dicas de cuidado/lavagem e a época/estilo estimado da peça.`

  for (const model of MODELOS) {
    try {
      const resposta = await ai.models.generateContent({
        model,
        contents,
        config: {
          responseMimeType: 'application/json',
          responseSchema: schemaPeca,
        },
      })
      const texto = resposta.text
      if (!texto) continue
      console.log(`[ia] dados gerados com o modelo ${model}`)
      return JSON.parse(texto) as DadosIA
    } catch (erro) {
      console.error(`[ia] falha no modelo ${model}:`, (erro as Error).message)
    }
  }
  return null
}
