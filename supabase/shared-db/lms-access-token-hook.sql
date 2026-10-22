-- Custom access token hook for the shared SayThanks auth/DB (staging).
--
-- Adds LMS claims to every token: user_role, is_super_admin, tenant_id,
-- tenant_role. lms.user_roles can hold more than one row per user (sign-up
-- creates `student`; an admin or teacher row is added later), so the role
-- pick is ordered by privilege. Without ORDER BY, LIMIT 1 returned whichever
-- row Postgres found first, and teachers/admins got the `student` claim.
--
-- Idempotent: CREATE OR REPLACE. Apply to the shared DB after the lms schema
-- is loaded. The function is referenced by GOTRUE_HOOK_CUSTOM_ACCESS_TOKEN_URI.

CREATE OR REPLACE FUNCTION app_private.custom_access_token_hook(event jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO ''
AS $function$
DECLARE
  claims jsonb;
  user_role lms.app_role;
  v_tenant_id uuid;
  v_tenant_role text;
  v_is_super_admin boolean;
  v_aud jsonb;
BEGIN
  claims := event->'claims';

  -- Fetch user role (highest privilege wins when several rows exist)
  SELECT role INTO user_role
  FROM lms.user_roles
  WHERE user_id = (event->>'user_id')::uuid
  ORDER BY CASE role::text WHEN 'admin' THEN 1 WHEN 'moderator' THEN 2 WHEN 'teacher' THEN 3 ELSE 4 END
  LIMIT 1;

  IF user_role IS NOT NULL THEN
    claims := jsonb_set(claims, '{user_role}', to_jsonb(user_role::text));
  ELSE
    claims := jsonb_set(claims, '{user_role}', to_jsonb('student'::text));
  END IF;

  -- Check if super admin
  SELECT EXISTS(
    SELECT 1 FROM lms.super_admins WHERE user_id = (event->>'user_id')::uuid
  ) INTO v_is_super_admin;
  claims := jsonb_set(claims, '{is_super_admin}', to_jsonb(v_is_super_admin));

  -- Get tenant context from raw_app_meta_data if available
  v_tenant_id := (event->'claims'->'app_metadata'->>'tenant_id')::uuid;

  IF v_tenant_id IS NOT NULL THEN
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(v_tenant_id::text));

    -- Get tenant role
    SELECT tu.role INTO v_tenant_role
    FROM lms.tenant_users tu
    WHERE tu.user_id = (event->>'user_id')::uuid
      AND tu.tenant_id = v_tenant_id
      AND tu.status = 'active'
    LIMIT 1;

    IF v_tenant_role IS NOT NULL THEN
      claims := jsonb_set(claims, '{tenant_role}', to_jsonb(v_tenant_role));
    ELSE
      claims := jsonb_set(claims, '{tenant_role}', to_jsonb('student'::text));
    END IF;
  END IF;

  -- Audience binding for OAuth-client tokens. Password and refresh-token
  -- logins carry no client_id claim and are untouched.
  IF claims ? 'client_id' THEN
    SELECT jsonb_agg(x.u) INTO v_aud
    FROM (
      SELECT 'authenticated' AS u
      UNION ALL
      SELECT url FROM app_private.oauth_token_audiences
    ) x;
    IF v_aud IS NOT NULL AND jsonb_array_length(v_aud) > 1 THEN
      claims := jsonb_set(claims, '{aud}', v_aud);
    END IF;
  END IF;

  RETURN jsonb_set(event, '{claims}', claims);
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'Error in custom_access_token_hook: %', SQLERRM;
    RETURN event;
END;
$function$;
