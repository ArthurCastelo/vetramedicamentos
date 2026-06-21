// ═══════════════════════════════════════════════════════════
// VETRA — Função serverless: análise de foto de prescrição via Groq Vision
// Roda no servidor da Netlify, nunca expõe a chave da API no navegador.
// ═══════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xiwkosnranwsudjkdlli.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inhpd2tvc25yYW53c3VkamtkbGxpIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODA5Nzc0NTQsImV4cCI6MjA5NjU1MzQ1NH0.72dWtHQZfaluwvvecsL_D6jFBY-Ah_x7KPTObaNRMec';

const GROQ_MODEL = 'meta-llama/llama-4-scout-17b-16e-instruct';

const PROMPT = `Você é um assistente que analisa fotos de prescrições veterinárias (receitas médicas para animais).
Extraia APENAS os nomes dos medicamentos e suas dosagens/instruções mencionados na imagem.
Ignore informações de paciente, veterinário, datas, CRMV ou qualquer outro dado que não seja medicamento.
Se a imagem não for legível ou não contiver uma prescrição médica, retorne uma lista vazia.

Responda SOMENTE em formato JSON, seguindo exatamente esta estrutura:
{
  "medicamentos": [
    { "nome": "Nome do medicamento", "dosagem": "dosagem ou instrução, se houver" }
  ],
  "legivel": true ou false
}`;

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };
  }

  const GROQ_API_KEY = process.env.GROQ_API_KEY;
  if (!GROQ_API_KEY) {
    console.error('GROQ_API_KEY não configurada nas variáveis de ambiente da Netlify');
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Configuração ausente no servidor' }) };
  }

  let body;
  try {
    body = JSON.parse(event.body);
  } catch (e) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido no corpo da requisição' }) };
  }

  const { prescricaoId, imageBase64, mimeType } = body;
  if (!prescricaoId || !imageBase64) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'prescricaoId e imageBase64 são obrigatórios' }) };
  }

  try {
    // 1. Chama o Groq Vision para extrair os medicamentos da imagem
    const groqResponse = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${GROQ_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: PROMPT },
              { type: 'image_url', image_url: { url: `data:${mimeType || 'image/jpeg'};base64,${imageBase64}` } },
            ],
          },
        ],
        temperature: 0.2,
        max_completion_tokens: 1024,
        response_format: { type: 'json_object' },
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Erro na API do Groq:', groqResponse.status, errText);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Erro ao consultar o serviço de análise de imagem', details: errText }) };
    }

    const groqData = await groqResponse.json();
    const rawContent = groqData.choices?.[0]?.message?.content;
    if (!rawContent) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Resposta vazia do serviço de análise' }) };
    }

    let parsed;
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      console.error('Resposta do Groq não é JSON válido:', rawContent);
      return { statusCode: 502, headers, body: JSON.stringify({ error: 'Resposta da IA em formato inesperado' }) };
    }

    const medicamentosExtraidos = Array.isArray(parsed.medicamentos) ? parsed.medicamentos : [];
    const legivel = parsed.legivel !== false;

    if (!medicamentosExtraidos.length) {
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify({
          ok: true,
          medicamentosSalvos: 0,
          legivel,
          aviso: legivel ? 'Nenhum medicamento identificado na imagem.' : 'A imagem não pôde ser lida claramente.',
        }),
      };
    }

    // 2. Conecta ao Supabase para buscar o catálogo de medicamentos e tentar casar por nome
    const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
    const { data: catalogo } = await sb.from('medicamentos').select('id, nome').eq('ativo', true);

    function encontrarNoCatalogo(nomeExtraido) {
      if (!catalogo) return null;
      const nomeNormalizado = nomeExtraido.toLowerCase().trim();
      const match = catalogo.find(m =>
        nomeNormalizado.includes(m.nome.toLowerCase()) || m.nome.toLowerCase().includes(nomeNormalizado)
      );
      return match ? match.id : null;
    }

    // 3. Monta os registros para prescricao_medicamentos
    const registros = medicamentosExtraidos.map((m, i) => {
      const medicamentoId = encontrarNoCatalogo(m.nome || '');
      return {
        prescricao_id: prescricaoId,
        medicamento_id: medicamentoId,
        nome_livre: medicamentoId ? null : (m.nome || 'Medicamento não identificado'),
        dosagem: m.dosagem || '',
        ordem: i,
        origem: 'ia',
      };
    });

    const { error: insertErr } = await sb.from('prescricao_medicamentos').insert(registros);
    if (insertErr) {
      console.error('Erro ao salvar medicamentos extraídos:', insertErr);
      return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro ao salvar no banco', details: insertErr.message }) };
    }

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({
        ok: true,
        medicamentosSalvos: registros.length,
        legivel,
        medicamentos: registros.map(r => ({ nome: r.nome_livre || '(catálogo)', dosagem: r.dosagem })),
      }),
    };

  } catch (err) {
    console.error('Erro inesperado na função analisar-foto:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'Erro interno', details: err.message }) };
  }
};
