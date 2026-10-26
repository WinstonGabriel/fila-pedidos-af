-- Referência de feriados; não representa escala, folga ou presença.
CREATE TABLE af_mobile.feriados_referencia (
 codigo text PRIMARY KEY,
 nome text NOT NULL CHECK(length(nome) BETWEEN 1 AND 120 AND nome !~ E'[\\[\\]\\n\\r]'),
 mes integer CHECK(mes BETWEEN 1 AND 12),
 dia integer CHECK(dia BETWEEN 1 AND 31),
 deslocamento_pascoa integer CHECK(deslocamento_pascoa=-2),
 vigente_desde date NOT NULL DEFAULT '2026-01-01',
 fonte text NOT NULL CHECK(fonte LIKE 'https://%'),
 CHECK((mes IS NOT NULL AND dia IS NOT NULL AND deslocamento_pascoa IS NULL) OR (mes IS NULL AND dia IS NULL AND deslocamento_pascoa IS NOT NULL))
);
ALTER TABLE af_mobile.feriados_referencia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON af_mobile.feriados_referencia FROM PUBLIC,anon,authenticated,service_role;

CREATE FUNCTION af_mobile.pascoa_referencia(ano integer) RETURNS date
LANGUAGE plpgsql IMMUTABLE STRICT SECURITY INVOKER SET search_path='' AS $$
DECLARE a integer; b integer; c integer; d integer; e integer; f integer; g integer; h integer; i integer; k integer; l integer; m integer; mes integer; dia integer;
BEGIN
 IF ano NOT BETWEEN 2026 AND 2100 THEN RETURN NULL; END IF;
 a:=ano%19;b:=ano/100;c:=ano%100;d:=b/4;e:=b%4;f:=(b+8)/25;g:=(b-f+1)/3;
 h:=(19*a+b-d-g+15)%30;i:=c/4;k:=c%4;l:=(32+2*e+2*i-h-k)%7;m:=(a+11*h+22*l)/451;
 mes:=(h+l-7*m+114)/31;dia:=(h+l-7*m+114)%31+1;
 RETURN make_date(ano,mes,dia);
END $$;
REVOKE ALL ON FUNCTION af_mobile.pascoa_referencia(integer) FROM PUBLIC,anon,authenticated,service_role;
