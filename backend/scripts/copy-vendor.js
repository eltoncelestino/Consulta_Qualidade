const fs = require('fs');
const path = require('path');

const destinationDirectory = path.join(__dirname, '../public/vendor');

fs.mkdirSync(destinationDirectory, { recursive: true });

const assets = [
  {
    source: path.join(path.dirname(require.resolve('chart.js')), 'chart.umd.js'),
    destination: path.join(destinationDirectory, 'chart.umd.js')
  },
  {
    source: require.resolve('xlsx/dist/xlsx.full.min.js'),
    destination: path.join(destinationDirectory, 'xlsx.full.min.js')
  }
];

assets.forEach(asset => {
  fs.copyFileSync(asset.source, asset.destination);
  console.log(`Biblioteca copiada para ${asset.destination}`);
});
