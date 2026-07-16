-- La gran final: permite guardar SOLO picks.bracket2._final hasta el pitido inicial
-- (19-jul-2026 21:00 CEST). No toca ningún otro candado: el cuadro original sigue
-- cerrado (POOL_LOCKED) y el 2º cuadro sigue cerrado (KO2_LOCKED).
create or replace function public.porra_set_final(
  p_code           text,
  p_participant_id uuid,
  p_final          jsonb
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_pool  uuid;
  v_picks jsonb;
  v_b2    jsonb;
begin
  select id into v_pool from porra_pools where upper(code) = upper(p_code);
  if v_pool is null then
    raise exception 'POOL_NOT_FOUND';
  end if;

  -- candado propio: solo hasta que empiece la final
  if now() >= timestamptz '2026-07-19 19:00:00+00' then
    raise exception 'FINAL_LOCKED';
  end if;

  select picks into v_picks
    from porra_participants
   where id = p_participant_id and pool_id = v_pool;
  if v_picks is null then
    raise exception 'PARTICIPANT_NOT_FOUND';
  end if;

  v_b2 := coalesce(v_picks->'bracket2', '{}'::jsonb);
  v_b2 := jsonb_set(v_b2, '{_final}', p_final, true);

  update porra_participants
     set picks = jsonb_set(v_picks, '{bracket2}', v_b2, true)
   where id = p_participant_id and pool_id = v_pool;

  return jsonb_build_object('ok', true);
end
$$;

grant execute on function public.porra_set_final(text, uuid, jsonb) to anon, authenticated;
