"""Reconstitute the exact two prepared Git trees inside the publication runner."""
import concurrent.futures
import hashlib
import json
import os
import re
import subprocess
import tempfile
import time
import zipfile
from datetime import datetime
from pathlib import Path
from urllib.error import URLError
from urllib.request import Request,urlopen
from zoneinfo import ZoneInfo


def main():
    manifest=json.loads(Path("transport.json").read_text())
    assert os.environ["GITHUB_REPOSITORY"]=="wasdaf/pulmo-opening-studies"
    repo=os.environ["GITHUB_REPOSITORY"]
    with tempfile.TemporaryDirectory() as td:
        tmp=Path(td)
        def fetch(part):
            path=tmp/part["name"]
            with path.open("wb") as target:
                subprocess.run(["gh","api",f"/repos/{repo}/releases/assets/{part['id']}",
                               "-H","Accept: application/octet-stream"],stdout=target,check=True)
            with path.open("rb") as f: assert hashlib.file_digest(f,"sha256").hexdigest()==part["sha256"]
            return path
        with concurrent.futures.ThreadPoolExecutor(max_workers=5) as workers:
            files=list(workers.map(fetch,manifest["parts"]))
        pack=tmp/"opening.pack";sha=hashlib.sha256()
        with pack.open("wb") as output:
            for file in files:
                payload=file.read_bytes();sha.update(payload);output.write(payload)
        assert sha.hexdigest()==manifest["sha256"]
        with pack.open("rb") as source:
            subprocess.run(["git","index-pack","--stdin"],stdin=source,check=True)
        for rev in manifest["refs"].values():subprocess.run(["git","cat-file","-e",rev+"^{commit}"],check=True)
        subprocess.run(["git","push","--atomic","origin",*[f"{rev}:refs/heads/{name}" for name,rev in manifest["refs"].items()]],check=True)
        c=json.loads(subprocess.check_output(["git","show",manifest["refs"]["main"]+":catalog.json"]))
        expected={}
        for row in c["items"]:
            day=datetime.fromisoformat(row["dateTime"]).astimezone(ZoneInfo("America/New_York")).strftime("%Y-%m-%d")
            name=re.sub(r'[<>:"/\\|?*]','-',row["downloadName"])
            expected[f"{day}/{name}"]=row
        public_zip=f"https://codeload.github.com/{repo}/zip/refs/heads/downloads"
        zip_path=tmp/"public.zip"
        for attempt in range(6):
            try:
                with urlopen(Request(public_zip,headers={"User-Agent":"Pulmo-public-archive-check"}),timeout=75) as reply, zip_path.open("wb") as output:
                    while data:=reply.read(2**20): output.write(data)
                break
            except (URLError,TimeoutError):
                if attempt==5:raise
                time.sleep(4)
        with zipfile.ZipFile(zip_path) as archive:
            members={i.filename.split("/",1)[1]:i for i in archive.infolist() if not i.is_dir()}
            assert members.keys()==expected.keys() and len(members)==len(c["items"])
            for name,entry in members.items():
                assert entry.file_size==expected[name]["downloadBytes"]
                with archive.open(entry) as f:assert hashlib.file_digest(f,"sha256").hexdigest()==expected[name]["downloadSha256"]
        print("PUBLIC_ZIP_AUDIT="+json.dumps(dict(refs=manifest["refs"],zip=public_zip,zipEntries=len(members),
              zipBytes=zip_path.stat().st_size,originalBytes=c["totalBytes"])),flush=True)


if __name__=="__main__":main()
