// 浅比较 同一个对象返回true，不同的两个对象{x:1} {x:1}返回true {x:1,y:2} {x:1}返回false {x:1} {x:2}返回false
export function shallowEqual(a: any, b: any): boolean {
	// ps:基本类型
	// Object.is(1,1) => true
	// Object.is(1,2) => false
	// 引用类型 两个对象肯定是不等的返回false，同一个对象返回true
	if (Object.is(a, b)) {
		return true;
	}

	// 如果a, b两个引用类型没有通过上述比较，那么进入现在的浅比较

	// a b有不是对象或者null的情况 直接返回false
	if (
		typeof a !== 'object' ||
		a === null ||
		typeof b !== 'object' ||
		b === null
	) {
		return false;
	}

	const keysA = Object.keys(a);
	const keysB = Object.keys(b);

	if (keysA.length !== keysB.length) {
		return false;
	}

	for (let i = 0; i < keysA.length; i++) {
		const key = keysA[i];
		// hasOwnProperty用来检测对象自身是否具有某个属性（不包括继承的属性）
		// b没有key、 key不相等
		if (!{}.hasOwnProperty.call(b, key) || !Object.is(a[key], b[key])) {
			return false;
		}
	}
	return true;
}
