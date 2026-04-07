"""
Manual verification script for cost calculation function
"""

# Test the cost calculation formula manually
def calculate_cost_manual(input_tokens: int, output_tokens: int, input_cost_per_1k: float, output_cost_per_1k: float) -> float:
    """Manual implementation of the cost calculation formula"""
    input_cost = (input_tokens / 1000.0) * input_cost_per_1k
    output_cost = (output_tokens / 1000.0) * output_cost_per_1k
    total_cost = input_cost + output_cost
    return total_cost


# Test cases
print("Cost Calculation Verification")
print("=" * 50)

# Test 1: Separate pricing
print("\nTest 1: Separate input/output pricing")
print("Input: 1000 tokens @ $0.01/1k")
print("Output: 500 tokens @ $0.03/1k")
cost1 = calculate_cost_manual(1000, 500, 0.01, 0.03)
print(f"Expected: $0.025")
print(f"Calculated: ${cost1}")
print(f"Match: {abs(cost1 - 0.025) < 0.0001}")

# Test 2: Unified pricing
print("\nTest 2: Unified pricing")
print("Input: 1000 tokens @ $0.02/1k")
print("Output: 500 tokens @ $0.02/1k")
cost2 = calculate_cost_manual(1000, 500, 0.02, 0.02)
print(f"Expected: $0.03")
print(f"Calculated: ${cost2}")
print(f"Match: {abs(cost2 - 0.03) < 0.0001}")

# Test 3: Large numbers
print("\nTest 3: Large token counts")
print("Input: 100000 tokens @ $0.01/1k")
print("Output: 50000 tokens @ $0.03/1k")
cost3 = calculate_cost_manual(100000, 50000, 0.01, 0.03)
print(f"Expected: $2.5")
print(f"Calculated: ${cost3}")
print(f"Match: {abs(cost3 - 2.5) < 0.0001}")

# Test 4: Zero tokens
print("\nTest 4: Zero tokens")
print("Input: 0 tokens @ $0.01/1k")
print("Output: 0 tokens @ $0.03/1k")
cost4 = calculate_cost_manual(0, 0, 0.01, 0.03)
print(f"Expected: $0.0")
print(f"Calculated: ${cost4}")
print(f"Match: {cost4 == 0.0}")

print("\n" + "=" * 50)
print("All tests passed!" if all([
    abs(cost1 - 0.025) < 0.0001,
    abs(cost2 - 0.03) < 0.0001,
    abs(cost3 - 2.5) < 0.0001,
    cost4 == 0.0
]) else "Some tests failed!")
