import 'vtk.js/Sources/favicon';

import vtkFullScreenRenderWindow from 'vtk.js/Sources/Rendering/Misc/FullScreenRenderWindow';
// import vtkHttpDataSetReader from 'vtk.js/Sources/IO/Core/HttpDataSetReader';
import vtkXMLImageDataReader from 'vtk.js/Sources/IO/XML/XMLImageDataReader';
import HttpDataAccessHelper from 'vtk.js/Sources/IO/Core/DataAccessHelper/HttpDataAccessHelper';
import vtkVolume from 'vtk.js/Sources/Rendering/Core/Volume';
import vtkVolumeMapper from 'vtk.js/Sources/Rendering/Core/VolumeMapper';
// import vtkInteractorStyleMPRSlice from 'vtk.js/Sources/Interaction/Style/InteractorStyleMPRSlice';
// import vtkCubeSource from 'vtk.js/Sources/Filters/Sources/CubeSource';
import vtkImageData from 'vtk.js/Sources/Common/DataModel/ImageData';
import vtkDataArray from 'vtk.js/Sources/Common/Core/DataArray';
import vtkColorTransferFunction from 'vtk.js/Sources/Rendering/Core/ColorTransferFunction';
import vtkPiecewiseFunction from 'vtk.js/Sources/Common/DataModel/PiecewiseFunction';

import vtkBoundingBox from 'vtk.js/Sources/Common/DataModel/BoundingBox';
// import vtkActor from 'vtk.js/Sources/Rendering/Core/Actor';
// import vtkMapper from 'vtk.js/Sources/Rendering/Core/Mapper';

const fullScreenRenderWindow = vtkFullScreenRenderWindow.newInstance({
  background: [0.3, 0.3, 0.3],
});
const renderWindow = fullScreenRenderWindow.getRenderWindow();
const renderer = fullScreenRenderWindow.getRenderer();

// const istyle = vtkInteractorStyleMPRSlice.newInstance();
// renderWindow.getInteractor().setInteractorStyle(istyle);

global.fullScreen = fullScreenRenderWindow;
global.renderWindow = renderWindow;

// ----------------------------------------------------------------------------
// Volume rendering
// ----------------------------------------------------------------------------

// const cubeSource = vtkCubeSource.newInstance();

// cubeSource.setXLength(100);
// cubeSource.setYLength(100);
// cubeSource.setZLength(1);

// const cubeActor = vtkActor.newInstance();
// const cubeMapper = vtkMapper.newInstance();

// cubeActor.setMapper(cubeMapper);
// cubeMapper.setInputConnection(cubeSource.getOutputPort());

const actor = vtkVolume.newInstance();
const mapper = vtkVolumeMapper.newInstance({
  sampleDistance: 1.1,
});
actor.setMapper(mapper);
// renderer.addActor(cubeActor);

const ofun = vtkPiecewiseFunction.newInstance();
ofun.addPoint(0, 0);
ofun.addPoint(1, 1.0);
actor.getProperty().setScalarOpacity(0, ofun);

function createLabelPipeline(backgroundImageData, colors) {
  // Create a labelmap image the same dimensions as our background volume.
  const labelMapData = vtkImageData.newInstance(
    backgroundImageData.get('spacing', 'origin', 'direction')
  );

  labelMapData.computeTransforms();

  const values = new Uint8Array(backgroundImageData.getNumberOfPoints());
  const dataArray = vtkDataArray.newInstance({
    numberOfComponents: 1, // labelmap with single component
    values,
  });
  labelMapData.getPointData().setScalars(dataArray);

  labelMapData.setDimensions(...backgroundImageData.getDimensions());
  labelMapData.setSpacing(...backgroundImageData.getSpacing());
  labelMapData.setOrigin(...backgroundImageData.getOrigin());
  labelMapData.setDirection(...backgroundImageData.getDirection());

  const labelMap = {
    actor: vtkVolume.newInstance(),
    mapper: vtkVolumeMapper.newInstance(),
    imageData: labelMapData,
    cfun: vtkColorTransferFunction.newInstance(),
    ofun: vtkPiecewiseFunction.newInstance(),
  };

  // Labelmap pipeline
  labelMap.mapper.setInputData(labelMapData);
  labelMap.actor.setMapper(labelMap.mapper);

  // Set up labelMap color and opacity mapping
  labelMap.cfun.addRGBPoint(0, 0, 0, 0);
  colors.forEach((c, i) => {
    labelMap.cfun.addRGBPoint(i + 1, ...c);
  });
  // labelMap.cfun.addRGBPoint(1, 1, 0, 0); // label "1" will be red
  // labelMap.cfun.addRGBPoint(2, 1, 0.333, 0.333); // label "1" will be red
  // labelMap.cfun.addRGBPoint(3, 1, 0.666, 0.666); // label "1" will be red

  labelMap.ofun.addPoint(0, 0);
  labelMap.ofun.addPoint(1, 0.825); // Red will have an opacity of 0.2.
  labelMap.ofun.addPoint(2, 0.5); // Red will have an opacity of 0.2.
  labelMap.ofun.addPoint(3, 0.25); // Red will have an opacity of 0.2.
  labelMap.ofun.setClamping(false);

  labelMap.actor.getProperty().setRGBTransferFunction(0, labelMap.cfun);
  labelMap.actor.getProperty().setScalarOpacity(0, labelMap.ofun);

  // For better looking volume rendering
  // - distance in world coordinates a scalar opacity of 1.0
  labelMap.actor
    .getProperty()
    .setScalarOpacityUnitDistance(
      0,
      vtkBoundingBox.getDiagonalLength(backgroundImageData.getBounds()) /
        Math.max(...backgroundImageData.getDimensions())
    );

  // const dataRange = backgroundImageData.getPointData().getScalars().getRange();

  labelMap.actor.getProperty().setGradientOpacityMinimumValue(0, 0);
  labelMap.actor
    .getProperty()
    .setGradientOpacityMaximumValue(
      0,
      40 /* (dataRange[1] - dataRange[0]) * 0.05 */
    );
  // - Use shading based on gradient
  // labelMap.actor.getProperty().setShade(true);
  labelMap.actor.getProperty().setUseGradientOpacity(0, true);
  // - generic good default
  labelMap.actor.getProperty().setGradientOpacityMinimumOpacity(0, 0.0);
  labelMap.actor.getProperty().setGradientOpacityMaximumOpacity(0, 1.0);
  labelMap.actor.getProperty().setAmbient(0.2);
  // labelMap.actor.getProperty().setDiffuse(0.7);
  // labelMap.actor.getProperty().setSpecular(0.3);
  // labelMap.actor.getProperty().setSpecularPower(8.0);

  return labelMap;
}

function fillBlobForThreshold(labelMaps, backgroundImageData) {
  const dims = labelMaps[0].getDimensions();
  const values = labelMaps.map((_) => _.getPointData().getScalars().getData());

  const backgroundValues = backgroundImageData
    .getPointData()
    .getScalars()
    .getData();
  const size = dims[0] * dims[1] * dims[2];
  const checkSize = Math.floor(dims[0] / 5);

  console.log(dims, size, checkSize);

  // const headThreshold = [324, 1524];
  const threshold = [-850, 4000];
  let flip = true;
  const counts = { 1: 0, 2: 0, 3: 0 };
  for (let i = 0; i < size; i++) {
    const x = Math.floor(i % dims[0]);
    const y = Math.floor((i / dims[0]) % dims[1]);
    const z = Math.floor(i / (dims[0] * dims[1]));

    if (x % checkSize === 0 && y % checkSize === 0) {
      flip = !flip;
    }

    const map1 = flip ? 0 : 1;
    const map2 = map1 === 0 ? 1 : 0;
    const map =
      x % (checkSize * 2) < checkSize &&
      y % (checkSize * 2) < checkSize &&
      z % (checkSize * 2) < checkSize
        ? map1
        : map2;

    if (map === map1) {
      values[map2][i] = 0;
    } else {
      values[map1][i] = 0;
    }
    // if (i < dims[0]) {
    //   console.log(x, y, z);
    //   console.log(x % (checkSize * 2));
    // }

    if (
      backgroundValues[i] >= threshold[0] &&
      backgroundValues[i] < threshold[1]
    ) {
      if (backgroundValues[i] > threshold[0] + 500) {
        values[map][i] = 1;
      } else if (backgroundValues[i] > threshold[0] + 100) {
        values[map][i] = 2;
      } else {
        values[map][i] = 3;
      }
      counts[values[map][i]]++;
    }
  }
  console.log(counts);

  values.forEach((v, i) => {
    labelMaps[i].getPointData().getScalars().setData(v);
  });
}

function onLoad(data) {
  mapper.setInputData(data);

  const labelMap1 = createLabelPipeline(data, [
    [1, 0.1, 0.1],
    [0.5, 0.1, 0.1],
    [0.25, 0.1, 0.1],
  ]);
  const labelMap2 = createLabelPipeline(data, [
    [0.1, 1, 0.1],
    [0.1, 0.5, 0.1],
    [0.1, 0.25, 0.1],
  ]);

  const sourceDataRGBTransferFunction = actor
    .getProperty()
    .getRGBTransferFunction(0);

  // sourceDataRGBTransferFunction.setMappingRange(324, 2324);
  const dataArray = data.getPointData().getScalars();
  const dataRange = dataArray.getRange();
  sourceDataRGBTransferFunction.setRange(...dataRange);

  fillBlobForThreshold([labelMap1.imageData, labelMap2.imageData], data);
  // fillBlobForThreshold([labelMap1.imageData], data);

  // Set interactor style volume mapper after mapper sets input data
  // istyle.setVolumeMapper(mapper);

  // const rgbTransferFunction = actor.getProperty().getRGBTransferFunction(0);
  // rgbTransferFunction.setRange(...dataArray.getRange());

  const sampleDistance =
    0.7 *
    Math.sqrt(
      data
        .getSpacing()
        .map((v) => v * v)
        .reduce((a, b) => a + b, 0)
    );
  mapper.setSampleDistance(sampleDistance);

  renderer.addVolume(actor);
  renderer.addVolume(labelMap2.actor);
  renderer.addVolume(labelMap1.actor);
  const camera = renderer.getActiveCamera();

  camera.setViewUp(1, 0, 0);
  camera.setParallelProjection(false);
  renderer.resetCamera();

  // button.innerText = `(${isParallel ? 'on' : 'off'})`;
  // renderWindow.render();

  mapper.setBlendModeToMaximumIntensity();

  renderWindow.render();
}

HttpDataAccessHelper.fetchBinary(`${__BASE_PATH__}/data/volume/test2.vti`, {
  // progressCallback,
}).then((binary) => {
  const vtiReader = vtkXMLImageDataReader.newInstance();
  vtiReader.parseAsArrayBuffer(binary);
  onLoad(vtiReader.getOutputData(0));
});
