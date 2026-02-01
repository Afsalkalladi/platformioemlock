// Script to generate PWA icons from SVG
// Run with: node scripts/generate-icons.js

const fs = require('fs');
const path = require('path');

// Check if sharp is available
let sharp;
try {
  sharp = require('sharp');
} catch (e) {
  console.log('Sharp not installed. Install with: npm install sharp');
  console.log('Or manually create PNG icons from public/icons/icon.svg');
  process.exit(1);
}

const sizes = [72, 96, 128, 144, 152, 180, 192, 384, 512];
const inputSvg = path.join(__dirname, '../public/icons/icon.svg');
const outputDir = path.join(__dirname, '../public/icons');

async function generateIcons() {
  // Ensure output directory exists
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }

  console.log('Generating PWA icons...\n');

  for (const size of sizes) {
    const outputFile = path.join(outputDir, `icon-${size}x${size}.png`);
    
    await sharp(inputSvg)
      .resize(size, size)
      .png()
      .toFile(outputFile);
    
    console.log(`✓ Generated ${size}x${size}`);
  }

  // Create apple-touch-icon (180x180)
  const appleTouchIcon = path.join(outputDir, 'apple-touch-icon.png');
  await sharp(inputSvg)
    .resize(180, 180)
    .png()
    .toFile(appleTouchIcon);
  
  console.log('✓ Generated apple-touch-icon.png');

  // Create favicon
  const favicon = path.join(__dirname, '../public/favicon.ico');
  await sharp(inputSvg)
    .resize(32, 32)
    .png()
    .toFile(favicon.replace('.ico', '.png'));
  
  console.log('✓ Generated favicon.png');

  console.log('\n✅ All icons generated successfully!');
  console.log(`   Output directory: ${outputDir}`);
}

generateIcons().catch(console.error);
