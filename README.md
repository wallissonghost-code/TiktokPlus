# TikTok Plus Engine

Motor experimental e independente da interface do TikTok Plus.

## Objetivo

Receber um `@username` (ou URL de perfil), coletar **somente dados públicos** disponíveis no perfil do TikTok, normalizar os vídeos e devolver métricas públicas + métricas derivadas em um contrato simples de API.

A interface final **não pertence a este repositório**. Este projeto existe para validar o motor antes da integração no TikTok Plus.

## Rodar

Requer Node.js 20+.

```bash
npm start
```

Teste:

```text
GET /health
GET /api/profile?username=@usuario
```

## Estrutura

- `src/providers/tiktok-public.js`: coleta pública, isolada do restante do sistema.
- `src/core/username.js`: validação/normalização de usuário.
- `src/core/analyze.js`: métricas derivadas.
- `src/services/profile-analysis.js`: orquestração.
- `src/server.js`: API HTTP mínima.

## Contrato atual

Para cada vídeo o motor tenta retornar:

- ID e URL;
- legenda/descrição;
- hashtags;
- data/hora de publicação;
- duração;
- capa;
- visualizações;
- curtidas;
- comentários;
- compartilhamentos;
- favoritos/salvamentos, quando expostos publicamente.

Também calcula taxas derivadas (curtidas, comentários, compartilhamentos, salvamentos e engajamento por visualização).

## Limite importante

Sem autenticação/analytics privados, o motor **não afirma possuir** tempo médio assistido, curva de retenção, taxa real de conclusão, fontes de tráfego ou comportamento minuto a minuto. Esses campos ficam explicitamente classificados como indisponíveis em vez de serem estimados como se fossem dados reais.

## Arquitetura

A coleta está atrás de um provider isolado porque o HTML/payload público do TikTok pode mudar ou aplicar bloqueios. Isso permite substituir o coletor sem alterar a API, o analisador ou a futura interface.
