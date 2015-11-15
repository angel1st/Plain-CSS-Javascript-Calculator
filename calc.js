document.addEventListener("DOMContentLoaded", function() {

	var Calculator = (function () {

		// this configuration object will hold all mathematical operations.
		var operationData = {
			add: {
				precedence: 1,
				name: 'add',
				operation: function (a, b) {return a + b;},
				output: function (a, b) {return a + ' + ' + b;},
				buttonHTML: '+'
			},
			subtract: {
				precedence: 1,
				name: 'subtract',
				operation: function (a, b) {return a - b;},
				output: function (a, b) {return a + ' - ' + b;},
				buttonHTML: '-'
			},
			multiply: {
				precedence: 2,
				name: 'multiply',
				operation: function (a, b) {return a * b;},
				output: function (a, b) {return a + ' * ' + b;},
				buttonHTML: '*'
			},
			divide: {
				precedence: 2,
				name: 'divide',
				operation: function (a, b) {return a / b;},
				isInvalidInput: function (a, b) {return b == 0 ? 'division by 0' : false;},
				output: function (a, b) {return a + ' / ' + b;},
				buttonHTML: '/'
			},
			power: {
				precedence: 3,
				name: 'power',
				operation: function (a, b) {return Math.pow(a, b);},
				isInvalidInput: function (a, b) {return isNaN(Math.pow(a, b)) ? 'complex number' : false;},
				output: function (a, b) {return a + ' ^ ' + b;},
				buttonHTML: 'x<sup>y</sup>'
			},
			context: {
				precedence: 5,
				singleInput: true,
				name: 'context',
				operation: function (a) {return a;},
				output: function (a) {return '(' + a + ')';}
			}
		};

		// pack all operations' common methods at one place
		var Operation = function (options) {

			// There's no need for external code to know about the
	 		// operation's inputs, so let's make them local
			var inputs = [];

			// Make all the passed options accessible as object properties
			for (var key in options) {
				this[key] = options[key];
			};

			// Adding an input just puts it into the inputs array.
  			// Before that, check whether the operation even needs another input, though.
			this.addInput = function (input) {
				if (this.isSaturated()) return this;
				inputs.push(input);
				return this;
			};

			// Check whether all the inputs are valid.
  			// If no validation funtion has been passed, all inputs are valid.
			this.isInvalidInput = this.isInvalidInput || function () {return false;};

			// Check whether the operation already has all the inputs it needs
			this.isSaturated = function () {
				var inputCount = this.singleInput ? 1 : 2;
				for (var i = 0; i < inputCount; ++i) {
					if (inputs[i] == null || isNaN(inputs[i])) return false;
				}
				return true;
			};

			// Execute the operation, and put the result into the value property
			this.execute = function () {
				// If execution has already failed once because of invalid inputs,
  				// there's no need to try again, since inputs can only be added, but not changed.
				if (this.error) return this;
				// If inputs are missing, or the operation has already been executed,
  				// there's no need to continue.
				if ( ! this.isSaturated() || this.value != null) return this;
				// Inputs don't have to be numbers — they can be other Operation objects too,
  				// so for calculation purposes, map the inputs to their numerical values.
				var inputValues = inputs.map(function (input) {return Number(input);});
				// If an input is invalid, throw an error.
  				// The error message is coming straight from the operation's configuration object
  				// and should explain well enough what went wrong (e.g. 'division by 0').
				this.error = this.isInvalidInput.apply(this, inputValues);
				if (this.error) {
					throw new Error(this.error);
				}
				this.calculationString = this.getCalculationString();
				this.value = this.operation.apply(this, inputValues);
				return this;
			};

			// Get a pretty representation of the calculation
			this.getCalculationString = function (lastInput, collapsed) {
				// If collapsed string is requested, try to return the calculation result
				if (collapsed) {
					this.execute();
					if (this.value != null) return this.value.toString();
				}
				// Map all inputs to their string representations
  				// regardless of whether they are numbers or Operation objects
				var singleInput = this.singleInput;
				var inputValues = inputs.map(function (input) {
					var inputValue = input.getCalculationString ?
						input.getCalculationString(lastInput, collapsed) :
						input.toString();
					// Single-input operations are already sporting parentheses
	    			// in their output, so if the inputValue has a pair too, remove them.
					return singleInput ? inputValue.replace(/^\((.*)\)$/g, '$1') : inputValue;
				});
				return options.output.apply(this, inputValues.concat([lastInput]));
			};

			// Define the numerical value of the operation as its caclulation result
  			// If there isn't a result yet, execute the operation first
			this.valueOf = function () {
				if (this.value == null) {
					this.execute();
				}
				return this.value;
			};

			// Define the string value of the operation as its pretty calculation string
  			// If it isn't set yet, execute the operation first
			this.toString = function () {
				if (this.calculationString == null) {
					this.execute();
				}
				return this.getCalculationString();
			};
		};

		//hold all inputs for us and decide on its own, which has to be fed to which,
		//so the precedences will be respected when the time comes for the Operations to do their thing
		var InputStack = (function () {
			// Data structure to keep track of contexts and operations
		     var levels;

		     // If a context has just been closed, store its value here.
		     // On the next input, the input's number will be discarded
		     // and the closed context's value will be used instead.
		     var closedContext;

		     // Whenever something can be calculated already, it will end up here.
		     var partialResult;

		     // Whenever an Operation object throws an error, we are going to catch it and
		     // put it here, so we'll know that it doesn't make sense to continue the calculation
		     var error;

		     // Stack object. Just an array with a peek function.
			 var Stack = function () {
				this.peek = function () {return this[this.length - 1];};
			};
			Stack.prototype = [];

			// Initialize the stack for managing context levels
			// and put in the first context level (which is a stack for managing operations).
			// We're at the beginning of a new calculation now,
			// so there are no open parentheses or errors yet.
			var reset = function () {
				levels = new Stack;
				levels.push(new Stack);
				closedContext = error = null;
			};

			// Feed the last operation to the new one, and put
		    // the new one into the last one's place on the stack
			var wrapLastOperation = function (operation) {
				var stack = levels.peek();
				stack.push(operation.addInput(stack.pop()));
				collapse(operation.precedence);
			};

			// Collapse the current context as far as possible.
		    // In order to figure out how far it can be collapsed,
		    // it needs to know the next operation's precedence.
			var collapse = function (precedence) {
				var stack = levels.peek();
				var currentOperation = stack.pop();
				var previousOperation = stack.peek();

				if ( ! currentOperation) return;

				if ( ! currentOperation.isSaturated()) {
					stack.push(currentOperation);
					return;
				}

				try {
					partialResult = Number(currentOperation);
				}
				catch (e) {
					partialResult = error = 'Error: ' + e.message;
				}

				if (previousOperation && previousOperation.precedence >= precedence) {
					previousOperation.addInput(currentOperation);
					collapse(precedence);
				}
				else {
					stack.push(currentOperation);
				}
			};

  			// Initialize the data structure
			reset();

			return {
				// Push a number and the next operation to the current stack
				push: function (number, operation) {
					error && reset();
					var stack = levels.peek();
					var lastOperation = stack.peek();
					var input = closedContext || number;
					closedContext = null;
					partialResult = Number(input);
					if ( ! lastOperation || operation.precedence > lastOperation.precedence) {
						stack.push(operation.addInput(input));
						collapse(operation.precedence);
					}
					else {
						lastOperation.addInput(input);
						collapse(operation.precedence);
						wrapLastOperation(operation);
					}
					return this;
				},
				// Open a new context (means: add an opening parenthesis to the calculation)
				openContext: function () {
					error && reset();
					var lastOperation = levels.peek().peek();
					if (closedContext || lastOperation && lastOperation.isSaturated()) return;
					levels.push(new Stack);
					return this;
				},
				// Close the last context (means: add a closing parenthesis to the calculation)
				closeContext: function (number) {
					error && reset();
					if (levels.length <= 1) return;
					var input = closedContext || number;
					var stack = levels.peek();
					var lastOperation = stack.peek();
					closedContext = new Operation(operationData.context).addInput(
						lastOperation ? (function () {
							lastOperation.addInput(input);
							collapse(0);
							return stack.pop();
						}()) : input
					);
					partialResult = Number(closedContext);
					levels.pop();
					return this;
				},
				// Calculate the end result
				evaluate: function (number) {
					error && reset();
					var input = closedContext || number;
					partialResult = Number(input);
					while (levels.length > 1) {
						this.closeContext(input);
					}
					var lastOperation = levels.peek().peek();
					lastOperation && lastOperation.addInput(input);
					collapse(0);
					reset();
					return this;
				},
				// Get a partial result for output in the calculator's number field.
				// The "reset" function resets everything except the partial result — this is done here.
				getPartialResult: function () {
					var _partialResult = partialResult;
					partialResult = 0;
					return _partialResult;
				},
				// Get a pretty string representing the calculation so far
				getCalculationString: function (collapsed) {
					var result = closedContext ? closedContext.getCalculationString('', collapsed) : '';
					for (var j = levels.length - 1; j >= 0; --j) {
						for (var i = levels[j].length - 1; i >= 0; --i) {
							result = levels[j][i].getCalculationString(result, collapsed);
						}
						if (j > 0) {
							result = '(' + result;
						}
					}
					return result;
				}
			};

		}());

		// UX related stuff
		// add button helper function
		var addButtonService = function (parent, html, className, onlick) {
			var buttonDiv = document.createElement('DIV');
			buttonDiv.className = 'button ' + className;
			buttonDiv.innerHTML = html;
			buttonDiv.onclick = onlick;
			parent.appendChild(buttonDiv);
		};

		var appendTo = function (parent, elementType, className) {
			var element = document.createElement(elementType);
			if (className) {
				element.className = className;
			}
			parent.appendChild(element);
			return element;
		};

		var i, m = 0;

		var $calculator = document.getElementById('calculator');

		if (!$calculator) {
			// no id found, just alert, and exit
			window.alert('No calculator id found!');
			return;
		}

		var $ioField = appendTo($calculator, 'DIV', 'io-field');

		var $calculation = appendTo($ioField, 'DIV', 'calculation');
		var $collapsedCalculation = appendTo($ioField, 'DIV', 'collapsed-calculation');
		var $input = appendTo($ioField, 'DIV', 'input');
		$input.textContent = 0;

		var $keyboardInput = appendTo($calculator, 'INPUT', 'keyboard-input');
		$keyboardInput.focus();

		var $numbers = appendTo($calculator, 'DIV', 'numbers');

		var $operations = appendTo($calculator, 'DIV', 'operations');

		var addNumberButton = function (number) {
			addButtonService($numbers, number, 'number ' + (number == '.' ? 'dot' : 'number-' + number), function () {
				if ($input.textContent.match(/\./) && number == '.') return;
				if ($input.textContent === '0' && number !== '.' || $input.getAttribute('clearOnInput')) {
					$input.textContent = '';
				}
				$input.setAttribute('clearOnInput', '');
				$input.textContent += this.textContent;
			});
		};

		var addOperationButton = function (operation, click) {
			addButtonService($operations, operation.buttonHTML, 'operation ' + operation.name, function (e) {
				click.call(this, e);
				$calculation.textContent = InputStack.getCalculationString();
				$collapsedCalculation.textContent = InputStack.getCalculationString(true);
				$input.textContent = InputStack.getPartialResult();
				$input.setAttribute('clearOnInput', 'true');
			});
		};

		var getInput = function () {
			var input = $input.textContent;
			return input.match(/error/i) ? 0 : parseFloat($input.textContent);
		};

		$calculator.onclick = function () {
			$keyboardInput.focus();
		};

		// add forEach array helper function to NodeList - will facilitate char detection
		NodeList.prototype.forEach = Array.prototype.forEach;
		$keyboardInput.onkeypress = function (event) {
			setTimeout(function () {
				switch (event.keyCode) {
					case 13: document.querySelector('.button.evaluate').click(); break;
					case 110: case 188: case 190: document.querySelector('.button.dot').click(); break;
					case 8: document.querySelector('.button.del').click(); break;
					case 46: document.querySelector('.button.clear-entry').click(); break;
					case 27: document.querySelector('.button.clear').click(); break;
					default:
						var val = String.fromCharCode(event.keyCode || event.charCode);
						$calculator.querySelectorAll('.button').forEach(function (button) {
							if (val === button.textContent) {
								button.click();
							}
						});
				}
			}, 0);
		};

		addButtonService($numbers, '&larr;', 'del', function () {
			$input.textContent = $input.textContent.replace(/.$/, '');
			$input.textContent.length || ($input.textContent = '0');
		});
		addButtonService($numbers, 'CE', 'clear-entry', function () {
			$input.textContent = '0';
		});
		addButtonService($numbers, 'C', 'clear', function () {
			document.querySelector('#calculator .evaluate').click();
			$input.textContent = '0';
		});
		'7894561230.'.split('').forEach(function (number) {
			addNumberButton(number.toString());
		});

		addOperationButton({buttonHTML: '(', name: 'openContext'}, function () {
			InputStack.openContext();
		});
		addOperationButton({buttonHTML: ')', name: 'closeContext'}, function () {
			InputStack.closeContext(getInput());
		});
		for (i in operationData) {
			(function (i) {
				if ( ! operationData[i].buttonHTML) return;
				addOperationButton(operationData[i], function () {
					InputStack.push(getInput(), new Operation(operationData[i]));
				});
			}(i));
		}
		addOperationButton({buttonHTML: '=', name: 'evaluate'}, function () {
			InputStack.evaluate(getInput());
		});


	}());

});
