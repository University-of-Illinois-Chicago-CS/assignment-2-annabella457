import vertexShaderSrc from './vertex.glsl.js';
import fragmentShaderSrc from './fragment.glsl.js'

var gl = null;
var vao = null;
var program = null;
var vertexCount = 0;
var uniformModelViewLoc = null;
var uniformProjectionLoc = null;
var heightmapData = null;

var modelScale = 1.0;
var deltaXMatrix = identityMatrix();
var deltaYMatrix = identityMatrix();
var projectionMatrix = identityMatrix();
var projectionOn = true;

var heightScale = 1.0;

var eye = [0, 5, 5];
var target = [0, 0, 0];
var upHint1 = [0, 1, 0];

function processImage(img)
{
	// draw the image into an off-screen canvas
	var off = document.createElement('canvas');
	
	var sw = img.width, sh = img.height;
	off.width = sw; off.height = sh;
	
	var ctx = off.getContext('2d');
	ctx.drawImage(img, 0, 0, sw, sh);
	
	// read back the image pixel data
	var imgd = ctx.getImageData(0,0,sw,sh);
	var px = imgd.data;
	
	// create a an array will hold the height value
	var heightArray = new Float32Array(sw * sh);
	
	// loop through the image, rows then columns
	for (var y=0;y<sh;y++) 
	{
		for (var x=0;x<sw;x++) 
		{
			// offset in the image buffer
			var i = (y*sw + x)*4;
			
			// read the RGB pixel value
			var r = px[i+0], g = px[i+1], b = px[i+2];
			
			// convert to greyscale value between 0 and 1
			var lum = (0.2126*r + 0.7152*g + 0.0722*b) / 255.0;

			// store in array
			heightArray[y*sw + x] = lum;
		}
	}

	return {
		data: heightArray,
		width: sw,
		height: sw
	};
}


window.loadImageFile = function(event)
{

	var f = event.target.files && event.target.files[0];
	if (!f) return;
	
	// create a FileReader to read the image file
	var reader = new FileReader();
	reader.onload = function() 
	{
		// create an internal Image object to hold the image into memory
		var img = new Image();
		img.onload = function() 
		{
			// heightmapData is globally defined
			heightmapData = processImage(img);

			// create triangle mesh and send buffers to gpu

			// at each (i, j) position in the heightmap, find the y height value 
			// from the heightmap by calculating the index into the 1D array
			// then also calculate the x and z coordinates based on the i, j position
			// store all triangles vertexes made in the positions array
			var positions = [];
			var width = heightmapData.width;
			var height = heightmapData.height;

			// duplicate indexes of repeated vertices
			// simpler to implement than using element_array_buffer
			for (var i = 0; i < height; i++) {
				for (var j = 0; j < width; j++) {
					// top-left triangle
					var x1 = j / (width) * 2 - 1;
					var y1 = heightmapData.data[i * width + j] * 2 - 1;
					var z1 = i / (height) * 2 - 1;
					// top-right triangle
					var x2 = (j + 1) / (width) * 2 - 1;
					var y2 = heightmapData.data[i * width + (j + 1)] * 2 - 1;
					var z2 = i / (height) * 2 - 1;
					// bottom-left triangle
					var x3 = j / (width) * 2 - 1;
					var y3 = heightmapData.data[(i + 1) * width + j] * 2 - 1;
					var z3 = (i + 1) / (height) * 2 - 1;
					// bottom-right triangle
					var x4 = (j + 1) / (width) * 2 - 1;
					var y4 = heightmapData.data[(i + 1) * width + (j + 1)] * 2 - 1;
					var z4 = (i + 1) / (height) * 2 - 1;

					// first triangle
					positions.push(x1, y1, z1);
					positions.push(x3, y3, z3);
					positions.push(x2, y2, z2);
					// second triangle
					positions.push(x2, y2, z2);
					positions.push(x3, y3, z3);
					positions.push(x4, y4, z4);
				}
			}
			vertexCount = positions.length / 3;
			
			var positionBuffer = createBuffer(gl, gl.ARRAY_BUFFER, new Float32Array(positions));

			var posAttribLoc = gl.getAttribLocation(program, "position");

			vao = createVAO(gl, posAttribLoc, positionBuffer, null, null, null, null);
		};
		img.onerror = function() 
		{
			console.error("Invalid image file.");
			alert("The selected file could not be loaded as an image.");
		};

		// the source of the image is the data load from the file
		img.src = reader.result;
	};
	reader.readAsDataURL(f);
}


function setupViewMatrix(eye, target)
{
    var forward = normalize(subtract(target, eye));
    var upHint  = [0, 1, 0];

    var right = normalize(cross(forward, upHint));
    var up    = cross(right, forward);

    var view = lookAt(eye, target, up);
    return view;

}

function draw()
{
	// perspective projection or not
	if (projectionOn == true){
		updateProjection()
	}

	var modelMatrix = identityMatrix();
	
	// rotate the model with the left click and drag
	modelMatrix = multiplyMatrices(modelMatrix, deltaXMatrix);
	modelMatrix = multiplyMatrices(modelMatrix, deltaYMatrix);
	
	// zooming in/out
	modelMatrix = multiplyMatrices(modelMatrix, scaleMatrix(modelScale, modelScale, modelScale));

	var heightScaleMatrix = multiplyMatrices(identityMatrix(), scaleMatrix(1.0, heightScale, 1.0));
	modelMatrix = multiplyMatrices(modelMatrix, heightScaleMatrix);

	// setup viewing matrix
	var eyeToTarget = subtract(target, eye);
	var viewMatrix = setupViewMatrix(eye, target);

	// model-view Matrix = view * model
	var modelviewMatrix = multiplyMatrices(viewMatrix, modelMatrix);


	// enable depth testing
	gl.enable(gl.DEPTH_TEST);

	// disable face culling to render both sides of the triangles
	gl.disable(gl.CULL_FACE);

	gl.clearColor(0.2, 0.2, 0.2, 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	// remember to clear the depth buffer bit too?
	gl.clear(gl.DEPTH_BUFFER_BIT);

	gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);
	gl.useProgram(program);

	
	
	// update modelview and projection matrices to GPU as uniforms
	gl.uniformMatrix4fv(uniformModelViewLoc, false, new Float32Array(modelviewMatrix));
	gl.uniformMatrix4fv(uniformProjectionLoc, false, new Float32Array(projectionMatrix));

	gl.bindVertexArray(vao);

	var checkbox = document.getElementById("wireframe");
	
	var primitiveType = gl.TRIANGLES;
	
	if (checkbox.checked){
		gl.drawArrays(gl.LINES, 0, vertexCount);
	} else {
		
		gl.drawArrays(primitiveType, 0, vertexCount);
	}
	
	
	requestAnimationFrame(draw);
	
}

function createBox()
{
	function transformTriangle(triangle, matrix) {
		var v1 = [triangle[0], triangle[1], triangle[2], 1];
		var v2 = [triangle[3], triangle[4], triangle[5], 1];
		var v3 = [triangle[6], triangle[7], triangle[8], 1];

		var newV1 = multiplyMatrixVector(matrix, v1);
		var newV2 = multiplyMatrixVector(matrix, v2);
		var newV3 = multiplyMatrixVector(matrix, v3);

		return [
			newV1[0], newV1[1], newV1[2],
			newV2[0], newV2[1], newV2[2],
			newV3[0], newV3[1], newV3[2]
		];
	}

	var box = [];

	var triangle1 = [
		-1, -1, +1,
		-1, +1, +1,
		+1, -1, +1,
	];
	box.push(...triangle1)

	var triangle2 = [
		+1, -1, +1,
		-1, +1, +1,
		+1, +1, +1
	];
	box.push(...triangle2);

	// 3 rotations of the above face
	for (var i=1; i<=3; i++) 
	{
		var yAngle = i* (90 * Math.PI / 180);
		var yRotMat = rotateYMatrix(yAngle);

		var newT1 = transformTriangle(triangle1, yRotMat);
		var newT2 = transformTriangle(triangle2, yRotMat);

		box.push(...newT1);
		box.push(...newT2);
	}

	// a rotation to provide the base of the box
	var xRotMat = rotateXMatrix(90 * Math.PI / 180);
	box.push(...transformTriangle(triangle1, xRotMat));
	box.push(...transformTriangle(triangle2, xRotMat));


	return {
		positions: box
	};

}

var isDragging = false;
var startX, startY;
var leftMouse = false;

function addMouseCallback(canvas)
{
	isDragging = false;

	canvas.addEventListener("mousedown", function (e) 
	{
		if (e.button === 0) {
			console.log("Left button pressed");
			leftMouse = true;
		} else if (e.button === 2) {
			console.log("Right button pressed");
			leftMouse = false;
		}

		isDragging = true;
		startX = e.offsetX;
		startY = e.offsetY;
	});

	canvas.addEventListener("contextmenu", function(e)  {
		e.preventDefault(); // disables the default right-click menu
	});


	canvas.addEventListener("wheel", function(e)  {
		e.preventDefault(); // prevents page scroll

		if (e.deltaY < 0) 
		{
			modelScale *= 1.1;
			
		} else {
			modelScale *= 0.9;
		}

		modelScale = Math.min(Math.max(0.1, modelScale), 10.0);
	});

	document.addEventListener("mousemove", function (e) {
		if (!isDragging) return;
		var currentX = e.offsetX;
		var currentY = e.offsetY;

		var deltaX = currentX - startX;
		var deltaY = currentY - startY;
		console.log('mouse drag by: ' + deltaX + ', ' + deltaY);

		if (leftMouse) {
            // left button: rotate the model
            var angleX = deltaX / canvas.width * 2 * Math.PI;
            var angleY = deltaY / canvas.height * 2 * Math.PI;

            deltaXMatrix = rotateYMatrix(angleX);
            deltaYMatrix = rotateXMatrix(angleY);
        }
        else {
            // right button: pan the camera
			var panSpeed = 0.001;
			var forward = normalize(subtract(target, eye));
			var right = normalize(cross(forward, upHint1));
			var newUp = normalize(cross(right, forward));

			var moveH = multiplyScalarVector(-deltaX * panSpeed, right);
			var moveV = multiplyScalarVector(deltaY * panSpeed, newUp);

			eye = add(add(eye, moveH), moveV);
			target = add(add(target, moveH), moveV);
		}

	});

	document.addEventListener("mouseup", function () {
		isDragging = false;
	});

	document.addEventListener("mouseleave", () => {
		isDragging = false;
	});
}

function scaleHeight(){
	var slider = document.getElementById("height");
	heightScale = parseFloat(slider.value) / 50.0;
}

function updateProjection() {
    var projectionType = document.getElementById("projection").value;

    if (projectionType === "perspective") {
        projectionOn = true;
        var fovRadians = 70 * Math.PI / 180;
        var nearClip = 0.1;
        var farClip = 100.0;
		var aspectRatio = +gl.canvas.width / +gl.canvas.height;
        projectionMatrix = perspectiveMatrix(fovRadians, aspectRatio, nearClip, farClip);
    } else if (projectionType === "orthographic") {
		projectionOn = false;
        var left = -5.0; 
        var right = 5.0; 
        var bottom = -5.0; 
        var top = 5.0; 
        var near = 0.1; 
        var far = 100.0; 
        projectionMatrix = orthographicMatrix(left, right, bottom, top, near, far);
    }
}

function initialize() 
{
	var canvas = document.querySelector("#glcanvas");
	canvas.width = canvas.clientWidth;
	canvas.height = canvas.clientHeight;

	gl = canvas.getContext("webgl2");

	// add mouse callbacks
	addMouseCallback(canvas);

	// height slider event listener
	document.getElementById("height").addEventListener("input", scaleHeight);
	document.getElementById("projection").addEventListener("change", updateProjection);

	var box = createBox();
	vertexCount = box.positions.length / 3;		// vertexCount is global variable used by draw()
	console.log(box);

	// create buffers to put in box
	var boxVertices = new Float32Array(box['positions']);
	var posBuffer = createBuffer(gl, gl.ARRAY_BUFFER, boxVertices);

	var vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSrc);
	var fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSrc);
	program = createProgram(gl, vertexShader, fragmentShader);

	// attributes (per vertex)
	var posAttribLoc = gl.getAttribLocation(program, "position");

	// uniforms
	uniformModelViewLoc = gl.getUniformLocation(program, 'modelview');
	uniformProjectionLoc = gl.getUniformLocation(program, 'projection');

	vao = createVAO(gl, 
		// positions
		posAttribLoc, posBuffer, 

		// normals (unused in this assignments)
		null, null, 

		// colors (not needed--computed by shader)
		null, null
	);

	window.requestAnimationFrame(draw);
}

window.onload = initialize();