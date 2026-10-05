import 'dotenv/config'
import express from 'express'
import cors from 'cors'

import categoriasRouter from './routes/categorias'
import pecasRouter from './routes/pecas'
import clientesRouter from './routes/clientes'
import adminsRouter from './routes/admins'
import propostasRouter from './routes/propostas'
import dashboardRouter from './routes/dashboard'
import ofertasRouter from './routes/ofertas'

const app = express()

app.use(cors())
app.use(express.json())

app.use('/categorias', categoriasRouter)
app.use('/pecas', pecasRouter)
app.use('/clientes', clientesRouter)
app.use('/admins', adminsRouter)
app.use('/propostas', propostasRouter)
app.use('/dashboard', dashboardRouter)
app.use('/ofertas', ofertasRouter)

app.get('/', (req, res) => {
  res.json({ mensagem: 'API Brechó do Gogó no ar 🎉' })
})

const PORT = process.env.PORT ?? 3000
app.listen(PORT, () => {
  console.log(`Servidor rodando em http://localhost:${PORT}`)
})
