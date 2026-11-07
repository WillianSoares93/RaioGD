"""Gera o .zip da extensão para enviar à Chrome Web Store (e ao Microsoft Edge Add-ons).
Uso:  python tools/empacotar_extensao.py
Saída: installer/Raio-Extensao-<versão>.zip  (o manifest.json fica na RAIZ do zip, como as lojas exigem).
A cada novo envio à loja a "version" do extension/manifest.json precisa ser maior que a anterior."""
import json, os, sys, zipfile

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
EXT = os.path.join(RAIZ, "extension")
IGNORAR = {"manter.txt"}            # marcadores de pasta que não fazem parte da extensão


def main():
    with open(os.path.join(EXT, "manifest.json"), encoding="utf-8") as f:
        man = json.load(f)
    # confere se todo arquivo citado no manifest existe (a loja recusa o envio se faltar algum)
    refs = set(man.get("icons", {}).values()) | set(man.get("action", {}).get("default_icon", {}).values())
    refs.add(man["background"]["service_worker"])
    for cs in man.get("content_scripts", []):
        refs.update(cs.get("js", []))
    falta = [r for r in sorted(refs) if not os.path.isfile(os.path.join(EXT, r))]
    if falta:
        sys.exit("Faltam arquivos citados no manifest.json: " + ", ".join(falta))
    out_dir = os.path.join(RAIZ, "installer")
    os.makedirs(out_dir, exist_ok=True)
    dest = os.path.join(out_dir, f"Raio-Extensao-{man['version']}.zip")
    n = 0
    with zipfile.ZipFile(dest, "w", zipfile.ZIP_DEFLATED) as z:
        for pasta, _dirs, arquivos in os.walk(EXT):
            for nome in sorted(arquivos):
                if nome in IGNORAR:
                    continue
                full = os.path.join(pasta, nome)
                z.write(full, os.path.relpath(full, EXT).replace(os.sep, "/"))
                n += 1
    print(f"ok: {dest} ({n} arquivos, versão {man['version']})")


if __name__ == "__main__":
    main()
