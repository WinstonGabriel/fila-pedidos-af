-- Somente os 14 feriados do calendário oficial de São Luís para 2026.
-- As regras recorrentes são reutilizadas de 2026 a 2100; alterações legais
-- posteriores precisam de revisão deste cadastro central.
INSERT INTO af_mobile.feriados_referencia(codigo,nome,mes,dia,deslocamento_pascoa,fonte)
SELECT codigo,nome,mes,dia,deslocamento,'https://diariooficial.saoluis.ma.gov.br/portal/calendario'
FROM (VALUES
 ('br-ano-novo','Confraternização Universal',1,1,NULL::integer),
 ('local-paixao','Paixão de Cristo / Sexta-feira Santa',NULL,NULL,-2),
 ('br-tiradentes','Tiradentes',4,21,NULL),
 ('br-trabalho','Dia do Trabalho',5,1,NULL),
 ('slz-sao-pedro','Dia de São Pedro',6,29,NULL),
 ('ma-adesao','Adesão do Maranhão à Independência do Brasil',7,28,NULL),
 ('br-independencia','Independência do Brasil',9,7,NULL),
 ('slz-aniversario','Natividade de Nossa Senhora / Aniversário de São Luís',9,8,NULL),
 ('br-aparecida','Nossa Senhora Aparecida',10,12,NULL),
 ('br-finados','Finados',11,2,NULL),
 ('br-republica','Proclamação da República',11,15,NULL),
 ('br-consciencia','Dia Nacional de Zumbi e da Consciência Negra',11,20,NULL),
 ('slz-conceicao','Nossa Senhora da Conceição',12,8,NULL),
 ('br-natal','Natal',12,25,NULL)
) r(codigo,nome,mes,dia,deslocamento);
