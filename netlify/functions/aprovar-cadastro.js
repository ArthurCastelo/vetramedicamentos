// ═══════════════════════════════════════════════════════════
// VETRA — Netlify Function: aprovar cadastro (login por username)
//
// Cria a conta Auth com e-mail interno falso (username@vetra.local)
// O usuário faz login com username + senha, nunca vê o e-mail.
// Usa SUPABASE_SERVICE_KEY para criar sem enviar e-mail de confirmação.
// ═══════════════════════════════════════════════════════════

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://xiwkosnranwsudjkdlli.supabase.co';

exports.handler = async (event) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') return { statusCode: 200, headers, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers, body: JSON.stringify({ error: 'Método não permitido' }) };

  const SERVICE_KEY = process.env.SUPABASE_SERVICE_KEY;
  if (!SERVICE_KEY) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: 'SUPABASE_SERVICE_KEY não configurada.' }) };
  }

  const authHeader = event.headers.authorization || event.headers.Authorization || '';
  const callerToken = authHeader.replace('Bearer ', '');
  if (!callerToken) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: 'Não autorizado.' }) };
  }

  let body;
  try { body = JSON.parse(event.body); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: 'JSON inválido' }) }; }

  const { solicitacaoId, adminUserId } = body;
  if (!solicitacaoId) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: 'solicitacaoId é obrigatório' }) };
  }

  const sbAdmin = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { autoRefreshToken: false, persistSession: false }
  });

  const { data: solic, error: solicErr } = await sbAdmin
    .from('solicitacoes_cadastro')
    .select('*')
    .eq('id', solicitacaoId)
    .single();

  if (solicErr || !solic) {
    return { statusCode: 404, headers, body: JSON.stringify({ error: 'Solicitação não encontrada' }) };
  }
  if (solic.status !== 'pendente') {
    return { statusCode: 409, headers, body: JSON.stringify({ error: `Solicitação já ${solic.status}.` }) };
  }

  const username = solic.username || solic.nome.toLowerCase().replace(/\s+/g, '.').replace(/[^a-z0-9.]/g, '');
  const fakeEmail = `${username}@vetra.local`;
  const senha = solic.senha_provisoria || 'VetraAcesso@2026';

  try {
    // Cria a conta Auth com e-mail interno — sem disparar nenhum e-mail real
    const { data: newUser, error: createErr } = await sbAdmin.auth.admin.createUser({
      email: fakeEmail,
      password: senha,
      email_confirm: true,
      user_metadata: { username, nome: solic.nome, tipo: solic.tipo }
    });

    let authUserId = newUser?.user?.id;

    if (createErr) {
      if (createErr.message?.includes('already') || createErr.code === '23505') {
        // Usuário já existia — busca pelo e-mail fake
        const { data: lista } = await sbAdmin.auth.admin.listUsers({ perPage: 1000 });
        const existing = lista?.users?.find(u => u.email === fakeEmail);
        if (existing) authUserId = existing.id;
        else throw createErr;
      } else {
        throw createErr;
      }
    }

    // Registra em veterinarios ou locais
    if (solic.tipo === 'veterinario') {
      const { error } = await sbAdmin.from('veterinarios').insert({
        nome: solic.nome, email: fakeEmail, telefone: solic.telefone,
        crmv: solic.crmv, bairro_id: solic.bairro_id,
        username, auth_user_id: authUserId, categoria: 'fixo', ativo: true
      });
      if (error) throw error;
    } else {
      const { error } = await sbAdmin.from('locais').insert({
        nome: solic.nome, email: fakeEmail, telefone: solic.telefone,
        cnpj: solic.cnpj, bairro_id: solic.bairro_id,
        username, auth_user_id: authUserId, ativo: true
      });
      if (error) throw error;
    }

    // Marca solicitação como aprovada
    await sbAdmin.from('solicitacoes_cadastro').update({
      status: 'aprovado',
      auth_user_id: authUserId,
      username,
      analisado_por: adminUserId || null,
      analisado_em: new Date().toISOString()
    }).eq('id', solicitacaoId);

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ ok: true, authUserId, username, fakeEmail })
    };

  } catch (err) {
    console.error('Erro ao aprovar:', err);
    return { statusCode: 500, headers, body: JSON.stringify({ error: err.message || 'Erro interno.' }) };
  }
};
