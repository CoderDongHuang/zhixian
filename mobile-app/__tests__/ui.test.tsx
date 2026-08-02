import { fireEvent, render } from "@testing-library/react-native";
import { PrimaryButton } from "../src/ui";
test("primary button exposes its command and handles press", () => { const onPress = jest.fn(); const view = render(<PrimaryButton label="同步" onPress={onPress}/>); fireEvent.press(view.getByRole("button", { name: "同步" })); expect(onPress).toHaveBeenCalledTimes(1); });
