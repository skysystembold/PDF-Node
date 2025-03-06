const express = require('express');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const app = express();
const PORT = process.env.PORT || 3000;

const pdfFolder = path.join(__dirname, 'pdfs');
const coversFolder = path.join(__dirname, 'covers');

// Crear la carpeta de portadas si no existe
if (!fs.existsSync(coversFolder)) {
    fs.mkdirSync(coversFolder);
}

// Función para recorrer recursivamente la carpeta pdfs y obtener archivos PDF con categoría
function getPdfFiles(baseDir, relativePath = '') {
    const currentPath = path.join(baseDir, relativePath);
    let pdfFiles = [];
    const items = fs.readdirSync(currentPath);
    items.forEach(item => {
        const itemPath = path.join(currentPath, item);
        const stats = fs.statSync(itemPath);
        if (stats.isDirectory()) {
            pdfFiles = pdfFiles.concat(getPdfFiles(baseDir, path.join(relativePath, item)));
        } else if (stats.isFile() && path.extname(item).toLowerCase() === '.pdf') {
            pdfFiles.push({
                name: item,
                category: relativePath || 'general',
                fullPath: itemPath,
                relativePdfPath: path.join(relativePath, item)
            });
        }
    });
    return pdfFiles;
}

// Función para generar la portada de un PDF en una ruta determinada
function generateCover(pdfPath, coverFullPath) {
    return new Promise((resolve, reject) => {
        // Aseguramos que exista la carpeta destino para la portada
        const coverDir = path.dirname(coverFullPath);
        if (!fs.existsSync(coverDir)) {
            fs.mkdirSync(coverDir, { recursive: true });
        }
        // Eliminamos la extensión .jpg para usar -singlefile y obtener directamente el archivo deseado
        const outputBase = coverFullPath.slice(0, -4);
        const cmd = `pdftoppm -jpeg -singlefile -f 1 -l 1 "${pdfPath}" "${outputBase}"`;
        exec(cmd, (error, stdout, stderr) => {
            if (error) {
                console.error('Error generando portada para:', pdfPath, error);
                return reject(error);
            }
            if (fs.existsSync(coverFullPath)) {
                resolve();
            } else {
                reject(new Error("No se generó la portada en " + coverFullPath));
            }
        });
    });
}

// Función que procesa todos los PDFs y genera las portadas si no existen
async function processPdfs() {
    const pdfFiles = getPdfFiles(pdfFolder);
    for (const pdf of pdfFiles) {
        const baseName = path.basename(pdf.name, '.pdf');
        const coverRelPath = path.join(pdf.category, baseName + '.jpg');
        const coverFullPath = path.join(coversFolder, coverRelPath);
        // Guardamos la ruta relativa de la portada para usarla en el API
        pdf.coverRelative = coverRelPath;
        if (!fs.existsSync(coverFullPath)) {
            try {
                console.log(`Generando portada para ${pdf.relativePdfPath}`);
                await generateCover(pdf.fullPath, coverFullPath);
            } catch (err) {
                console.error('Error al procesar', pdf.relativePdfPath, err);
            }
        }
    }
}

// Endpoint API que devuelve la lista de PDFs con sus detalles
app.get('/api/pdfs', (req, res) => {
    const pdfFiles = getPdfFiles(pdfFolder);
    const pdfList = pdfFiles.map(pdf => {
        const stats = fs.statSync(pdf.fullPath);
        // Recalcular la ruta relativa de la portada:
        const baseName = path.basename(pdf.name, '.pdf');
        const coverRelPath = path.join(pdf.category, baseName + '.jpg');
        return {
            name: pdf.name,
            category: pdf.category,
            size: stats.size,
            cover: '/covers/' + coverRelPath,  // Ruta que se usará en el front
            pdf: '/pdfs/' + pdf.relativePdfPath
        };
    });
    res.json(pdfList);
});

// Servir archivos estáticos (página, PDFs y portadas)
app.use(express.static('public'));
app.use('/pdfs', express.static(pdfFolder));
app.use('/covers', express.static(coversFolder));

// Procesamos los PDFs y luego arrancamos el servidor
processPdfs().then(() => {
    app.listen(PORT, () => {
        console.log(`Servidor iniciado en el puerto ${PORT}`);
    });
}).catch(err => {
    console.error('Error procesando PDFs:', err);
});