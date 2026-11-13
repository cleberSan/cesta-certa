import { useId, useRef, useState, type SubmitEvent } from "react";
import { gerarId } from "../../shared/identificador";
import { EscolhaDoMercado, type CargaDaBase } from "./EscolhaDoMercado";
import type { OpcaoDeMercado } from "./escolha";
import {
  limitesDoPreco,
  registrarPrecoDigitado,
  type MercadoDoPreco,
  type ObservacaoDePreco,
} from "./precos";
import { mensagemDoPreco } from "./textos";

/**
 * Preço digitado no mercado (spec 0001, CA-15): produto, marca, tamanho, preço, mercado e o
 * mínimo do atacado. Depois de guardar, o mercado fica escolhido e o foco volta ao produto,
 * para registrar o próximo preço da mesma visita.
 */
export function FormularioDoPreco({
  produtos,
  opcoes,
  carga,
  quantosHa,
  onGuardar,
  onFechar,
}: {
  produtos: readonly string[];
  opcoes: readonly OpcaoDeMercado[];
  carga: CargaDaBase;
  quantosHa: number;
  onGuardar: (observacao: ObservacaoDePreco) => void;
  onFechar: () => void;
}) {
  const base = useId();
  const [produto, setProduto] = useState("");
  const [marca, setMarca] = useState("");
  const [tamanho, setTamanho] = useState("");
  const [preco, setPreco] = useState("");
  const [mercado, setMercado] = useState<MercadoDoPreco | null>(null);
  const [atacado, setAtacado] = useState("");
  const [erro, setErro] = useState<string | null>(null);
  const campoDoProduto = useRef<HTMLInputElement>(null);

  const enviar = (evento: SubmitEvent<HTMLFormElement>) => {
    evento.preventDefault();
    const registrado = registrarPrecoDigitado(
      quantosHa,
      { produto, marca, tamanho, preco, mercado, minimoAtacado: atacado },
      { agora: new Date(), gerarId },
    );
    if (!registrado.ok) {
      setErro(mensagemDoPreco(registrado.erro));
      return;
    }
    setErro(null);
    setProduto("");
    setMarca("");
    setTamanho("");
    setPreco("");
    setAtacado("");
    onGuardar(registrado.valor);
    campoDoProduto.current?.focus();
  };

  return (
    <form
      id="digitar"
      className="precos-formulario cartao"
      aria-labelledby={`${base}-titulo`}
      onSubmit={enviar}
      noValidate
    >
      <h2 id={`${base}-titulo`}>Digitar um preço</h2>
      <p className="precos-ajuda">
        Anote o preço da prateleira ou do cupom. Ele fica marcado como digitado, com a data de hoje.
      </p>
      <div className="campo">
        <label htmlFor={`${base}-produto`}>Produto</label>
        <input
          ref={campoDoProduto}
          id={`${base}-produto`}
          type="text"
          list={`${base}-produtos`}
          autoComplete="off"
          maxLength={limitesDoPreco.produto}
          placeholder="Arroz"
          value={produto}
          onChange={(evento) => setProduto(evento.target.value)}
        />
        <datalist id={`${base}-produtos`}>
          {produtos.map((nome) => (
            <option key={nome} value={nome} />
          ))}
        </datalist>
      </div>
      <div className="precos-dupla">
        <div className="campo">
          <label htmlFor={`${base}-marca`}>Marca (se tiver)</label>
          <input
            id={`${base}-marca`}
            type="text"
            autoComplete="off"
            maxLength={limitesDoPreco.marca}
            value={marca}
            onChange={(evento) => setMarca(evento.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor={`${base}-tamanho`}>Tamanho (se tiver)</label>
          <input
            id={`${base}-tamanho`}
            type="text"
            autoComplete="off"
            maxLength={limitesDoPreco.tamanho}
            placeholder="5 kg, 12x1L, 32 rolos"
            value={tamanho}
            onChange={(evento) => setTamanho(evento.target.value)}
          />
        </div>
      </div>
      <div className="precos-dupla">
        <div className="campo">
          <label htmlFor={`${base}-preco`}>Preço da embalagem (R$)</label>
          <input
            id={`${base}-preco`}
            type="text"
            inputMode="decimal"
            autoComplete="off"
            maxLength={20}
            placeholder="0,00"
            value={preco}
            onChange={(evento) => setPreco(evento.target.value)}
          />
        </div>
        <div className="campo">
          <label htmlFor={`${base}-atacado`}>Atacado: a partir de quantas unidades?</label>
          <input
            id={`${base}-atacado`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            aria-describedby={`${base}-atacado-ajuda`}
            value={atacado}
            onChange={(evento) => setAtacado(evento.target.value)}
          />
          <p id={`${base}-atacado-ajuda`} className="precos-ajuda">
            Deixe vazio se o preço vale para qualquer quantidade.
          </p>
        </div>
      </div>
      <EscolhaDoMercado
        id={`${base}-mercado`}
        rotulo="Mercado"
        opcoes={opcoes}
        carga={carga}
        valor={mercado}
        onEscolher={setMercado}
      />
      {erro !== null && (
        <p className="mensagem-erro" role="alert">
          {erro}
        </p>
      )}
      <div className="acoes">
        <button type="submit" className="botao">
          Guardar preço
        </button>
        <button type="button" className="botao botao-secundario" onClick={onFechar}>
          Fechar
        </button>
      </div>
    </form>
  );
}
