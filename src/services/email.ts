import nodemailer from 'nodemailer'

// Envio de e-mails (Nodemailer). Tudo é "melhor esforço": se o SMTP não estiver
// configurado ou falhar, a venda segue normalmente e o erro só aparece no log.
//
// Variáveis de ambiente (veja .env.example):
//   SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, MAIL_FROM, SITE_URL, ADMIN_EMAIL
//
// ATENÇÃO: o Render gratuito bloqueia as portas SMTP 25, 465 e 587. Use um serviço
// que aceite a porta 2525 (ex.: Brevo, smtp-relay.brevo.com) ou um plano pago.

const NOME_DA_CASA = 'Brechó do Gogó'

type Transporte = ReturnType<typeof nodemailer.createTransport>
let transporte: Transporte | null | undefined

function obterTransporte(): Transporte | null {
  if (transporte !== undefined) return transporte
  const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env
  if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    transporte = null
    return transporte
  }
  const porta = Number(SMTP_PORT) || 2525
  transporte = nodemailer.createTransport({
    host: SMTP_HOST,
    port: porta,
    secure: porta === 465, // 465 = TLS direto; as demais usam STARTTLS
    auth: { user: SMTP_USER, pass: SMTP_PASS },
    connectionTimeout: 10_000,
    greetingTimeout: 10_000,
    socketTimeout: 15_000,
  })
  return transporte
}

// Peças da casa não têm vendedor cadastrado: os avisos vão para ADMIN_EMAIL (se existir)
export function pessoaDaCasa(): { nome: string; email: string } | null {
  const email = process.env.ADMIN_EMAIL
  return email ? { nome: NOME_DA_CASA, email } : null
}

export function emailConfigurado(): boolean {
  return obterTransporte() !== null
}

const esc = (t: string) =>
  t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const moeda = (v: unknown) =>
  Number(v).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const site = () => (process.env.SITE_URL ?? '').replace(/\/$/, '')

function moldura(titulo: string, linhas: string[], caminho: string, botao: string) {
  const link = site() ? `${site()}${caminho}` : ''
  const corpo = linhas.map((l) => `<p style="margin:0 0 12px">${l}</p>`).join('')
  const cta = link
    ? `<p style="margin:20px 0"><a href="${link}" style="background:#006045;color:#fff;padding:10px 18px;border-radius:8px;text-decoration:none">${esc(botao)}</a></p>`
    : ''
  return `<div style="font-family:Arial,sans-serif;max-width:520px;color:#222">
<h2 style="color:#006045;margin:0 0 16px">${esc(titulo)}</h2>${corpo}${cta}
<p style="color:#888;font-size:12px;margin-top:24px">${NOME_DA_CASA} — e-mail automático, não responda.</p></div>`
}

const paraTexto = (html: string) =>
  html
    .replace(/<\/p>|<\/h2>/g, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .trim()

export interface MensagemEmail {
  para: string | null | undefined
  assunto: string
  titulo: string
  linhas: string[] // já com HTML escapado
  caminho: string // página do site para o botão (ex.: /minhas-vendas)
  botao: string
}

// Nunca lança erro e não precisa de await: chame com `void enviarEmail(...)`.
export async function enviarEmail(m: MensagemEmail): Promise<void> {
  if (!m.para) return
  const t = obterTransporte()
  if (!t) {
    console.log(`[email] SMTP não configurado; e-mail "${m.assunto}" não enviado`)
    return
  }
  const html = moldura(m.titulo, m.linhas, m.caminho, m.botao)
  try {
    const from = process.env.MAIL_FROM || process.env.SMTP_USER
    await t.sendMail({
      from: `"${NOME_DA_CASA}" <${from}>`,
      to: m.para,
      subject: `${NOME_DA_CASA}: ${m.assunto}`,
      html,
      text: paraTexto(html),
    })
    console.log(`[email] enviado para ${m.para}: ${m.assunto}`)
  } catch (erro) {
    console.error(`[email] falha ao enviar "${m.assunto}":`, (erro as Error).message)
  }
}

// ---------- Mensagens prontas ----------

interface Pessoa { nome: string; email?: string | null; cidade?: string | null }
interface PecaMin { id: number; descricao: string; preco: unknown }

const contatoHtml = (p: Pessoa) =>
  `<b>${esc(p.nome)}</b>${p.email ? ` — ${esc(p.email)}` : ''}${p.cidade ? ` (${esc(p.cidade)})` : ''}`

// Vendedor: seu anúncio foi aprovado ou reprovado
export const emailModeracao = (
  vendedor: Pessoa & { email: string },
  peca: PecaMin,
  aprovado: boolean,
  motivo?: string | null,
): MensagemEmail => ({
  para: vendedor.email,
  assunto: aprovado ? 'seu anúncio foi aprovado' : 'seu anúncio não foi aprovado',
  titulo: aprovado ? 'Anúncio publicado!' : 'Anúncio não aprovado',
  linhas: aprovado
    ? [`Olá, ${esc(vendedor.nome)}! Seu anúncio <b>${esc(peca.descricao)}</b> foi aprovado e já aparece na loja.`]
    : [
        `Olá, ${esc(vendedor.nome)}. Seu anúncio <b>${esc(peca.descricao)}</b> não foi aprovado.`,
        `Motivo: ${esc(motivo ?? 'não informado')}`,
      ],
  caminho: '/minhas-vendas',
  botao: 'Ver minhas vendas',
})

// Vendedor: alguém reservou a peça pelo preço (negócio fechado → contato do comprador)
export const emailReservaParaVendedor = (
  vendedor: Pessoa & { email: string },
  comprador: Pessoa,
  peca: PecaMin,
  valor: unknown,
): MensagemEmail => ({
  para: vendedor.email,
  assunto: 'sua peça foi reservada',
  titulo: 'Sua peça foi reservada!',
  linhas: [
    `Olá, ${esc(vendedor.nome)}! <b>${esc(peca.descricao)}</b> foi reservada por <b>${moeda(valor)}</b>.`,
    `Comprador: ${contatoHtml(comprador)}`,
    'Combine a entrega e o pagamento com a pessoa e, depois, confirme a venda no site.',
  ],
  caminho: '/minhas-vendas',
  botao: 'Abrir minhas vendas',
})

// Vendedor: chegou uma proposta (ainda não é negócio fechado → sem e-mail do comprador)
export const emailNovaProposta = (
  vendedor: Pessoa & { email: string },
  comprador: Pessoa,
  peca: PecaMin,
  mensagem: string,
  valorOferta?: unknown,
): MensagemEmail => ({
  para: vendedor.email,
  assunto: 'nova proposta no seu anúncio',
  titulo: 'Você recebeu uma proposta',
  linhas: [
    `<b>${esc(comprador.nome)}</b> fez uma proposta em <b>${esc(peca.descricao)}</b> (anunciada por ${moeda(peca.preco)}).`,
    valorOferta ? `Valor oferecido: <b>${moeda(valorOferta)}</b>` : 'Sem valor sugerido: pagaria o preço anunciado.',
    `Mensagem: “${esc(mensagem)}”`,
  ],
  caminho: '/minhas-vendas',
  botao: 'Responder proposta',
})

// Comprador: proposta aceita (contato do vendedor) ou recusada
export const emailRespostaProposta = (
  comprador: Pessoa & { email: string },
  vendedor: Pessoa,
  peca: PecaMin,
  aceita: boolean,
  resposta: string,
  valor: unknown,
): MensagemEmail => ({
  para: comprador.email,
  assunto: aceita ? 'sua proposta foi aceita' : 'sua proposta foi recusada',
  titulo: aceita ? 'Proposta aceita!' : 'Proposta recusada',
  linhas: aceita
    ? [
        `Olá, ${esc(comprador.nome)}! Sua proposta em <b>${esc(peca.descricao)}</b> foi aceita por <b>${moeda(valor)}</b>. A peça está reservada para você.`,
        `Vendedor: ${contatoHtml(vendedor)}`,
        `Resposta: “${esc(resposta)}”`,
      ]
    : [
        `Olá, ${esc(comprador.nome)}. Sua proposta em <b>${esc(peca.descricao)}</b> foi recusada.`,
        `Resposta: “${esc(resposta)}”`,
      ],
  caminho: '/minhas-compras',
  botao: 'Ver minhas compras',
})

// Comprador: o vendedor confirmou a venda
export const emailVendaConfirmada = (
  comprador: Pessoa & { email: string },
  peca: PecaMin,
  valor: unknown,
): MensagemEmail => ({
  para: comprador.email,
  assunto: 'compra confirmada',
  titulo: 'Compra confirmada',
  linhas: [
    `Olá, ${esc(comprador.nome)}! O vendedor confirmou a venda de <b>${esc(peca.descricao)}</b> por <b>${moeda(valor)}</b>.`,
  ],
  caminho: '/minhas-compras',
  botao: 'Ver minhas compras',
})

// Avisa a outra parte que a reserva foi desfeita
export const emailReservaLiberada = (
  destino: Pessoa & { email: string },
  peca: PecaMin,
  quemDesfez: 'vendedor' | 'comprador',
): MensagemEmail => ({
  para: destino.email,
  assunto: 'reserva desfeita',
  titulo: 'Reserva desfeita',
  linhas:
    quemDesfez === 'vendedor'
      ? [`Olá, ${esc(destino.nome)}. O vendedor liberou a reserva de <b>${esc(peca.descricao)}</b>.`]
      : [
          `Olá, ${esc(destino.nome)}. O comprador desistiu de <b>${esc(peca.descricao)}</b>.`,
          'O anúncio voltou a ficar disponível na loja.',
        ],
  caminho: quemDesfez === 'vendedor' ? '/minhas-compras' : '/minhas-vendas',
  botao: 'Abrir o site',
})
