import base64,sys
s=open('dog_template.html', encoding='utf-8').read()
ref=sys.argv[1] if len(sys.argv)>1 else 'ref.jpg'
out=s.replace('__BIN__',base64.b64encode(open('dog.bin','rb').read()).decode()).replace('__REF__',base64.b64encode(open(ref,'rb').read()).decode()).replace('__META__',open('dog.json', encoding='utf-8').read())
open('dog.html','w',encoding='utf-8').write(out)
js=out.split('<script>\n{')[1].split('}\n</script>')[0]; open('dog.js','w',encoding='utf-8').write('{'+js+'}')
print(len(out))
