-- Add account_token column to store CedarToy account token for URL-based authentication
-- This token is used in the URL path: https://toy.cedarstar.org/{token}
alter table public.cedartoy_machine_accounts
  add column if not exists account_token text;

-- Index for quick token lookups
create index if not exists cedartoy_machine_accounts_account_token_idx
  on public.cedartoy_machine_accounts(account_token)
  where account_token is not null;

-- Add comment explaining the token usage
comment on column public.cedartoy_machine_accounts.account_token is
  'CedarToy account token used in URL path for authenticated requests. Must be included in request URL as https://toy.cedarstar.org/{token} rather than as request parameter.';
