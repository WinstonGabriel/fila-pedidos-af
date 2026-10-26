-- Triagem no banco, compatível com o coletor AF já instalado (6.9+).
ALTER TABLE af_mobile.pedidos_capturados
 ADD COLUMN triagem_ate timestamptz NOT NULL DEFAULT (clock_timestamp()+interval '10 seconds'),
 ADD COLUMN triagem_consultas integer NOT NULL DEFAULT 0 CHECK(triagem_consultas>=0),
 ADD COLUMN aprovacao_af_em timestamptz;
CREATE INDEX pedidos_origem_pendente_consulta_idx ON af_mobile.pedidos_capturados(proxima_consulta,primeiro_visto)
 WHERE af_situacao='autorizado_manual' AND triagem_consultas<3;
