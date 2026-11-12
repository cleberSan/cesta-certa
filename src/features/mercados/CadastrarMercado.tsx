import { useEffect, useId, useRef, useState, type SubmitEvent } from "react";
import { tiposDeMercado, type TipoDeMercado } from "../../shared/contratos/mercados";
import { gerarId } from "../../shared/identificador";
import type { PontoEscolhido } from "./ajustes";
import type { Ponto } from "./geo";
import { pedirLocalizacao } from "./localizacao";
import {
  cadastrarMercado,
  ehTipoDeMercado,
  limitesDoProprio,
  type MercadoProprio,
} from "./proprios";
import { descreverTipo, mensagemDaLocalizacao, mensagemDoCadastro } from "./textos";

type Onde = "busca" | "aqui";

/**
 * Cadastro do mercado que falta na base (spec 0001, CA-08). O lugar é o ponto da busca ou a
 * localização do aparelho, pedida só no envio; "Marcar no mapa" chega com o mapa (T10).
 */
export function CadastrarMercado({
  ponto,
  proprios,
  onCadastrar,
  onCancelar,
}: {
  ponto: PontoEscolhido;
  proprios: readonly MercadoProprio[];
  onCadastrar: (mercado: MercadoProprio) => void;
  onCancelar: () => void;
}) {
  const base = useId();
  const [nome, setNome] = useState("");
  const [tipo, setTipo] = useState<TipoDeMercado>("supermercado");
  const [onde, setOnde] = useState<Onde>("busca");
  const [pedindo, setPedindo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const campoDoNome = useRef<HTMLInputElement>(null);

  useEffect(() => campoDoNome.current?.focus(), []);

  const conferir = (lugar: Ponto) =>
    cadastrarMercado(proprios, { nome, tipo, ponto: lugar }, { agora: new Date(), gerarId });

  const enviar = async (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    setErro(null);
    // Nome e tipo são conferidos antes de pedir a localização: a pergunta do navegador só
    // aparece quando o resto já está certo.
    const previa = conferir(ponto);
    if (!previa.ok && previa.erro.tipo !== "repetido") {
      setErro(mensagemDoCadastro(previa.erro));
      campoDoNome.current?.focus();
      return;
    }
    let lugar: Ponto = ponto;
    if (onde === "aqui") {
      setPedindo(true);
      const local = await pedirLocalizacao(globalThis.navigator?.geolocation);
      setPedindo(false);
      if (!local.ok) {
        setErro(mensagemDaLocalizacao(local.erro, "cadastro"));
        return;
      }
      lugar = local.valor;
    }
    const resultado = onde === "aqui" ? conferir(lugar) : previa;
    if (!resultado.ok) {
      setErro(mensagemDoCadastro(resultado.erro));
      return;
    }
    onCadastrar(resultado.valor);
  };

  return (
    <form
      className="cartao mercados-cadastro"
      aria-labelledby={`${base}-titulo`}
      noValidate
      onSubmit={(evento) => void enviar(evento)}
    >
      <h3 id={`${base}-titulo`}>Cadastrar mercado</h3>
      <p className="mercados-nota">
        Para o mercado que não aparece na lista. Ele fica só neste aparelho e entra na cópia dos
        seus dados.
      </p>
      <div className="campo">
        <label htmlFor={`${base}-nome`}>Nome do mercado</label>
        <input
          ref={campoDoNome}
          id={`${base}-nome`}
          type="text"
          autoComplete="off"
          maxLength={limitesDoProprio.nome}
          value={nome}
          onChange={(evento) => setNome(evento.target.value)}
        />
      </div>
      <div className="campo">
        <label htmlFor={`${base}-tipo`}>Tipo</label>
        <select
          id={`${base}-tipo`}
          value={tipo}
          onChange={(evento) => {
            if (ehTipoDeMercado(evento.target.value)) setTipo(evento.target.value);
          }}
        >
          {tiposDeMercado.map((opcao) => (
            <option key={opcao} value={opcao}>
              {descreverTipo(opcao)}
            </option>
          ))}
        </select>
      </div>
      <fieldset className="campo">
        <legend>Onde ele fica</legend>
        <label className="mercados-opcao">
          <input
            type="radio"
            name={`${base}-onde`}
            value="busca"
            checked={onde === "busca"}
            onChange={() => setOnde("busca")}
          />
          No ponto da busca ({ponto.rotulo ?? "a sua localização"})
        </label>
        <label className="mercados-opcao">
          <input
            type="radio"
            name={`${base}-onde`}
            value="aqui"
            checked={onde === "aqui"}
            onChange={() => setOnde("aqui")}
          />
          Onde estou agora, pela localização do aparelho
        </label>
      </fieldset>
      <p role="status" className="mercados-carregando">
        {pedindo ? "Pedindo a localização ao navegador…" : ""}
      </p>
      {erro !== null && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="acoes">
        <button type="submit" className="botao" disabled={pedindo}>
          Cadastrar
        </button>
        <button type="button" className="botao botao-secundario" onClick={onCancelar}>
          Cancelar
        </button>
      </div>
    </form>
  );
}
