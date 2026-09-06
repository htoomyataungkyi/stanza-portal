const path=require('node:path');
require('esbuild').buildSync({entryPoints:[path.resolve(__dirname,'../../walkthrough-viewer.source.js')],outfile:path.resolve(__dirname,'../../walkthrough-viewer.js'),nodePaths:[path.join(__dirname,'node_modules')],bundle:true,format:'esm',minify:true,legalComments:'eof'});
